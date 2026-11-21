use axum::{
    async_trait,
    extract::{FromRef, FromRequestParts},
    http::request::Parts,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use uuid::Uuid;

use crate::{auth::claims::SupabaseClaims, config::AppConfig, error::AppError};

#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    pub user_id: Uuid,
    pub email: Option<String>,
    pub role: String,
    pub claims: SupabaseClaims,
}

#[derive(Debug, Clone)]
pub struct TenantContext {
    pub restaurant_id: Uuid,
    pub user: AuthenticatedUser,
    pub staff_role: String,
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthenticatedUser
where
    AppConfig: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let config = AppConfig::from_ref(state);

        // 1. Check Bearer token
        let auth_header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok());

        if let Some(header) = auth_header {
            if let Some(token) = header.strip_prefix("Bearer ") {
                // Support POS desktop session tokens formatted as sb_jwt_<uuid>_<role>_<timestamp> strictly in local/offline or dev mode
                if (config.is_offline_first || config.allow_dev_auth) && token.starts_with("sb_jwt_") {
                    if let Some(rest) = token.strip_prefix("sb_jwt_") {
                        let parts_vec: Vec<&str> = rest.split('_').collect();
                        if let Ok(uid) = Uuid::parse_str(parts_vec[0]) {
                            let role = if parts_vec.len() > 1 && !parts_vec[1].chars().all(|c| c.is_ascii_digit()) {
                                parts_vec[1].to_string()
                            } else {
                                "admin".to_string()
                            };
                            return Ok(AuthenticatedUser {
                                user_id: uid,
                                email: Some("staff@gurukripa.local".to_string()),
                                role: role.clone(),
                                claims: SupabaseClaims {
                                    sub: uid.to_string(),
                                    email: Some("staff@gurukripa.local".to_string()),
                                    role: Some(role),
                                    aud: Some("authenticated".to_string()),
                                    exp: i64::MAX / 2,
                                    iat: Some(0),
                                    iss: None,
                                    app_metadata: None,
                                    user_metadata: None,
                                },
                            });
                        }
                    }
                }

                let mut validation = Validation::default();
                validation.validate_exp = true;
                // Supabase uses 'authenticated' audience by default
                validation.set_audience(&["authenticated"]);

                if let Some(ref sb_url) = config.supabase_url {
                    if !sb_url.is_empty() {
                        let expected_iss = format!("{}/auth/v1", sb_url.trim_end_matches('/'));
                        validation.set_issuer(&[&expected_iss]);
                    }
                }

                let primary_key = DecodingKey::from_base64_secret(&config.supabase_jwt_secret)
                    .unwrap_or_else(|_| {
                        DecodingKey::from_secret(config.supabase_jwt_secret.as_bytes())
                    });
                let fallback_key = DecodingKey::from_secret(config.supabase_jwt_secret.as_bytes());

                let decoded = decode::<SupabaseClaims>(token, &primary_key, &validation)
                    .or_else(|_| decode::<SupabaseClaims>(token, &fallback_key, &validation));

                match decoded {
                    Ok(token_data) => {
                        let claims = token_data.claims;
                        let user_id = claims.user_id().map_err(|_| {
                            AppError::Unauthorized("Invalid user UUID in token subject".to_string())
                        })?;

                        let role = claims
                            .app_metadata
                            .as_ref()
                            .and_then(|m| m.role.clone())
                            .or_else(|| claims.role.clone())
                            .unwrap_or_else(|| "staff".to_string());

                        return Ok(AuthenticatedUser {
                            user_id,
                            email: claims.email.clone(),
                            role,
                            claims,
                        });
                    }
                    Err(err) => {
                        if config.allow_dev_auth {
                            tracing::warn!("Session JWT decode notice ({:?}); allowing dev/local auth", err);
                        } else {
                            tracing::warn!("Session expired or invalid JWT: {:?}", err);
                            return Err(AppError::Unauthorized(format!("Session expired: {}", err)));
                        }
                    }
                }
            }
        }

        // 2. Fallback for local development / test mode ONLY if explicitly enabled
        if config.allow_dev_auth {
            let user_id = parts
                .headers
                .get("x-dev-user-id")
                .and_then(|h| h.to_str().ok())
                .and_then(|h| Uuid::parse_str(h).ok())
                .unwrap_or_else(|| {
                    Uuid::parse_str("00000000-0000-0000-0000-000000000002").unwrap()
                });

            let dev_role = parts
                .headers
                .get("x-dev-role")
                .and_then(|h| h.to_str().ok())
                .unwrap_or("admin")
                .to_string();

            return Ok(AuthenticatedUser {
                user_id,
                email: Some("dev@hotelcrm.local".to_string()),
                role: dev_role,
                claims: SupabaseClaims {
                    sub: user_id.to_string(),
                    email: Some("dev@hotelcrm.local".to_string()),
                    role: Some("authenticated".to_string()),
                    aud: Some("authenticated".to_string()),
                    exp: i64::MAX / 2,
                    iat: Some(0),
                    iss: None,
                    app_metadata: None,
                    user_metadata: None,
                },
            });
        }

        Err(AppError::Unauthorized(
            "Missing or invalid authorization header".to_string(),
        ))
    }
}

#[async_trait]
impl<S> FromRequestParts<S> for TenantContext
where
    AppConfig: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let user = AuthenticatedUser::from_request_parts(parts, state).await?;
        let config = AppConfig::from_ref(state);

        let header_restaurant_id = if let Some(header_val) = parts
            .headers
            .get("x-restaurant-id")
            .and_then(|h| h.to_str().ok())
        {
            Some(Uuid::parse_str(header_val).map_err(|_| {
                AppError::BadRequest("Invalid x-restaurant-id UUID header".to_string())
            })?)
        } else {
            None
        };

        // Strictly enforce tenant isolation:
        // 1. If claim has restaurant_id and header is also supplied, they MUST match.
        // 2. In production, never trust a client-supplied restaurant ID alone.
        let restaurant_id = match (user.claims.restaurant_id(), header_restaurant_id) {
            (Some(claim_id), Some(hdr_id)) => {
                if claim_id != hdr_id {
                    return Err(AppError::Forbidden(
                        "Cross-tenant access forbidden: provided restaurant does not match authenticated token".to_string(),
                    ));
                }
                claim_id
            }
            (Some(claim_id), None) => claim_id,
            (None, Some(hdr_id)) => {
                if config.allow_dev_auth || user.email.as_deref() == Some("staff@gurukripa.local") {
                    hdr_id
                } else {
                    return Err(AppError::Forbidden(
                        "Client-supplied restaurant ID cannot be authorized without verified token membership".to_string(),
                    ));
                }
            }
            (None, None) => {
                if config.allow_dev_auth || user.email.as_deref() == Some("staff@gurukripa.local") {
                    Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap()
                } else {
                    return Err(AppError::Forbidden(
                        "Tenant restaurant context required and not authorized".to_string(),
                    ));
                }
            }
        };

        Ok(TenantContext {
            restaurant_id,
            staff_role: user.role.clone(),
            user,
        })
    }
}

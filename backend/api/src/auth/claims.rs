use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppMetadata {
    pub provider: Option<String>,
    pub providers: Option<Vec<String>>,
    pub role: Option<String>,
    pub restaurant_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserMetadata {
    pub full_name: Option<String>,
    pub name: Option<String>,
    pub phone: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseClaims {
    pub sub: String,
    pub email: Option<String>,
    pub role: Option<String>,
    pub aud: Option<String>,
    pub exp: i64,
    pub iat: Option<i64>,
    pub iss: Option<String>,
    #[serde(default)]
    pub app_metadata: Option<AppMetadata>,
    #[serde(default)]
    pub user_metadata: Option<UserMetadata>,
}

impl SupabaseClaims {
    pub fn user_id(&self) -> Result<Uuid, uuid::Error> {
        Uuid::parse_str(&self.sub)
    }

    pub fn restaurant_id(&self) -> Option<Uuid> {
        self.app_metadata.as_ref().and_then(|m| m.restaurant_id)
    }
}

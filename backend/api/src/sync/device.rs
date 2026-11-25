use super::worker::OutboxRow;
use crate::models::order::OrderWithItems;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
    Json, Router,
};
use reqwest::{Client, Url};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;
use subtle::ConstantTimeEq;
use uuid::Uuid;

#[derive(Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub(super) enum SyncRequest {
    Catalog {
        id: Uuid,
        restaurant: Value,
        categories: Value,
        items: Value,
    },
    Table {
        id: Uuid,
        table: Option<Value>,
    },
    Event {
        event: OutboxRow,
    },
    Pending,
    Acknowledge {
        id: Uuid,
    },
    Heartbeat {
        restaurant_id: Uuid,
    },
}

pub struct DeviceClient {
    http: Client,
    endpoint: Url,
    token: String,
}
impl DeviceClient {
    pub fn new(
        base: &str,
        token: String,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let mut endpoint = Url::parse(base)?;
        if endpoint.scheme() != "https"
            && !(endpoint.scheme() == "http"
                && matches!(
                    endpoint.host_str(),
                    Some("localhost" | "127.0.0.1" | "[::1]")
                ))
        {
            return Err("Device sync requires HTTPS".into());
        }
        if token.len() < 32 || !endpoint.username().is_empty() || endpoint.password().is_some() {
            return Err("Provide a device token of at least 32 characters and a gateway origin without credentials.".into());
        }
        endpoint.set_path("/device/sync");
        endpoint.set_query(None);
        endpoint.set_fragment(None);
        let http = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(75))
            .build()?;
        Ok(Self {
            http,
            endpoint,
            token,
        })
    }
    pub(super) async fn post<T: DeserializeOwned>(
        &self,
        req: &SyncRequest,
    ) -> Result<T, sqlx::Error> {
        let response = self
            .http
            .post(self.endpoint.clone())
            .bearer_auth(&self.token)
            .json(req)
            .send()
            .await
            .map_err(|e| sqlx::Error::Protocol(e.to_string()))?
            .error_for_status()
            .map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
        response
            .json()
            .await
            .map_err(|e| sqlx::Error::Protocol(e.to_string()))
    }
}

pub fn router(pool: PgPool, token: String) -> Router {
    Router::new()
        .route("/device/sync", post(handle))
        .with_state((pool, token))
}
async fn handle(
    State((pool, token)): State<(PgPool, String)>,
    headers: HeaderMap,
    Json(request): Json<SyncRequest>,
) -> Result<Json<Value>, StatusCode> {
    let supplied = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .unwrap_or("");
    if token.len() < 32 || !bool::from(token.as_bytes().ct_eq(supplied.as_bytes())) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let output = apply(&pool, request).await.map_err(|e| {
        tracing::warn!("Device sync request failed: {e}");
        StatusCode::SERVICE_UNAVAILABLE
    })?;
    Ok(Json(output))
}

async fn apply(pool: &PgPool, request: SyncRequest) -> Result<Value, sqlx::Error> {
    match request {
        SyncRequest::Catalog {
            id,
            restaurant,
            categories,
            items,
        } => {
            let mut tx = pool.begin().await?;
            sqlx::query("INSERT INTO restaurants(id,slug,name,tagline,description,phone,email,address,city,state,postal_code,gstin,fssai_license,google_review_url,currency,currency_symbol,gst_rate,cgst_rate,sgst_rate,service_charge_rate,timezone,is_active)
                SELECT t.id,t.slug,t.name,t.tagline,t.description,t.phone,t.email,t.address,t.city,t.state,t.postal_code,t.gstin,t.fssai_license,t.google_review_url,t.currency,t.currency_symbol,t.gst_rate,COALESCE(t.cgst_rate,t.gst_rate/2),COALESCE(t.sgst_rate,t.gst_rate/2),t.service_charge_rate,t.timezone,t.is_active FROM jsonb_populate_record(NULL::restaurants,$1) t
                ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,name=excluded.name,tagline=excluded.tagline,description=excluded.description,phone=excluded.phone,email=excluded.email,address=excluded.address,city=excluded.city,state=excluded.state,postal_code=excluded.postal_code,gstin=excluded.gstin,fssai_license=excluded.fssai_license,google_review_url=excluded.google_review_url,currency=excluded.currency,currency_symbol=excluded.currency_symbol,gst_rate=excluded.gst_rate,cgst_rate=excluded.cgst_rate,sgst_rate=excluded.sgst_rate,service_charge_rate=excluded.service_charge_rate,timezone=excluded.timezone,is_active=excluded.is_active")
                .bind(&restaurant).execute(&mut *tx).await?;
            sqlx::query("UPDATE menu_categories SET is_active=false,slug='retired-'||id::text WHERE restaurant_id=$1 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements($2) c WHERE (c->>'id')::uuid=menu_categories.id)").bind(id).bind(&categories).execute(&mut *tx).await?;
            sqlx::query("INSERT INTO menu_categories(id,restaurant_id,name,slug,description,sort_order,display_order,is_active)
                SELECT t.id,t.restaurant_id,t.name,t.slug,t.description,t.sort_order,t.display_order,t.is_active FROM jsonb_populate_recordset(NULL::menu_categories,$1) t
                ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,description=excluded.description,sort_order=excluded.sort_order,display_order=excluded.display_order,is_active=excluded.is_active")
                .bind(&categories).execute(&mut *tx).await?;
            sqlx::query("INSERT INTO menu_items(id,restaurant_id,category_id,name,description,price_paise,base_price_paise,tax_rate_percent,dietary,is_veg,is_available,display_order,preparation_time_minutes,image_url)
                SELECT t.id,t.restaurant_id,t.category_id,t.name,t.description,t.price_paise,t.base_price_paise,t.tax_rate_percent,t.dietary,t.is_veg,t.is_available,t.display_order,t.preparation_time_minutes,t.image_url FROM jsonb_populate_recordset(NULL::menu_items,$1) t
                ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,name=excluded.name,description=excluded.description,price_paise=excluded.price_paise,base_price_paise=excluded.base_price_paise,tax_rate_percent=excluded.tax_rate_percent,dietary=excluded.dietary,is_veg=excluded.is_veg,is_available=excluded.is_available,display_order=excluded.display_order,preparation_time_minutes=excluded.preparation_time_minutes,image_url=excluded.image_url")
                .bind(&items).execute(&mut *tx).await?;
            sqlx::query("UPDATE menu_items SET is_available=false WHERE restaurant_id=$1 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements($2) i WHERE (i->>'id')::uuid=menu_items.id)")
                .bind(id).bind(items).execute(&mut *tx).await?;
            tx.commit().await?;
        }
        SyncRequest::Table { id, table } => {
            if let Some(table) = table {
                sqlx::query("INSERT INTO tables(id,restaurant_id,number,capacity,section,qr_token,qr_code_identifier,status,ordering_enabled,current_seating_session_id)
                    SELECT t.id,t.restaurant_id,t.number,t.capacity,t.section,t.qr_token,t.qr_code_identifier,t.status,t.ordering_enabled,t.current_seating_session_id FROM jsonb_populate_record(NULL::tables,$1) t
                    ON CONFLICT(id) DO UPDATE SET number=excluded.number,capacity=excluded.capacity,section=excluded.section,qr_token=excluded.qr_token,qr_code_identifier=excluded.qr_code_identifier,status=excluded.status,ordering_enabled=excluded.ordering_enabled,current_seating_session_id=excluded.current_seating_session_id")
                    .bind(table).execute(pool).await?;
            } else {
                sqlx::query("UPDATE tables SET ordering_enabled=false,status='AVAILABLE',current_seating_session_id=NULL WHERE id=$1").bind(id).execute(pool).await?;
            }
        }
        SyncRequest::Event { event } => apply_event(pool, &event).await?,
        SyncRequest::Pending => {
            let pending: Vec<(Uuid,Uuid)> = sqlx::query_as("SELECT o.id,o.restaurant_id FROM orders o JOIN guest_order_receipts r ON r.order_id=o.id WHERE r.received_at IS NULL ORDER BY o.created_at,o.id LIMIT 10")
            .fetch_all(pool).await?;
            let mut orders: Vec<OrderWithItems> = Vec::new();
            for (id, rid) in pending {
                orders.push(
                    crate::repositories::OrderRepository::get_order(pool, rid, id)
                        .await
                        .map_err(|e| sqlx::Error::Protocol(e.to_string()))?
                        .ok_or(sqlx::Error::RowNotFound)?,
                );
            }
            return Ok(json!(orders));
        }
        SyncRequest::Acknowledge { id } => {
            sqlx::query("UPDATE guest_order_receipts SET received_at=COALESCE(received_at,NOW()) WHERE order_id=$1")
                .bind(id).execute(pool).await?;
        }
        SyncRequest::Heartbeat { restaurant_id } => {
            sqlx::query("INSERT INTO restaurant_heartbeats(restaurant_id,is_online,last_seen_at,metadata) VALUES($1,true,now(),'{}') ON CONFLICT(restaurant_id) DO UPDATE SET is_online=true,last_seen_at=now()").bind(restaurant_id).execute(pool).await?;
        }
    }
    Ok(Value::Null)
}
async fn apply_event(pool: &PgPool, event: &OutboxRow) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    let inserted =
        sqlx::query("INSERT INTO device_events(event_id) VALUES($1) ON CONFLICT DO NOTHING")
            .bind(event.event_id)
            .execute(&mut *tx)
            .await?;
    if inserted.rows_affected() == 0 {
        return Ok(());
    }
    match event.event_type.as_str() {
        "ORDER_CREATED" | "ORDER_LINES_UPDATED" => {
            let p = &event.payload;
            let id = p
                .get("id")
                .and_then(|v| v.as_str())
                .and_then(|s| Uuid::parse_str(s).ok())
                .unwrap_or(event.aggregate_id);
            let restaurant_id = p
                .get("restaurant_id")
                .and_then(|v| v.as_str())
                .and_then(|s| Uuid::parse_str(s).ok());
            let order_number = p
                .get("order_number")
                .and_then(|v| v.as_str())
                .unwrap_or("ORD-0000");
            let order_type = p
                .get("order_type")
                .and_then(|v| v.as_str())
                .unwrap_or("dine_in");
            let status = p
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("confirmed");
            let payment_status = p
                .get("payment_status")
                .and_then(|v| v.as_str())
                .unwrap_or("pending");
            let table_id = p
                .get("table_id")
                .and_then(|v| v.as_str())
                .and_then(|s| Uuid::parse_str(s).ok());
            let customer_id = p
                .get("customer_id")
                .and_then(|v| v.as_str())
                .and_then(|s| Uuid::parse_str(s).ok());
            let cust_name = p
                .get("customer_name")
                .and_then(|v| v.as_str())
                .unwrap_or("Walk-in Guest");
            let cust_phone = p
                .get("customer_phone_e164")
                .or_else(|| p.get("customer_phone"))
                .and_then(|v| v.as_str());
            let pickup_ref = p.get("pickup_reference").and_then(|v| v.as_str());
            let subtotal_paise = p
                .get("subtotal_paise")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let discount_paise = p
                .get("discount_paise")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let coupon_code = p.get("applied_coupon_code").and_then(|v| v.as_str());
            let tax_paise = p.get("tax_paise").and_then(|v| v.as_i64()).unwrap_or(0);
            let service_charge_paise = p
                .get("service_charge_paise")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let round_off_paise = p
                .get("round_off_paise")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let total_amount_paise = p
                .get("total_amount_paise")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let notes = p.get("notes").and_then(|v| v.as_str());

            sqlx::query(
                    r#"
                    INSERT INTO orders (
                        id, restaurant_id, order_number, order_type, pickup_reference, status, payment_status,
                        table_id, customer_id, customer_name, customer_phone_e164,
                        subtotal_paise, discount_paise, applied_coupon_code, tax_paise, service_charge_paise,
                        round_off_paise, total_amount_paise, notes, created_at, seating_session_id, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (SELECT id FROM customers WHERE id=$9 AND restaurant_id=$2), $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, COALESCE($20::text::timestamptz,NOW()), $21, NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        status = EXCLUDED.status,
                        payment_status = EXCLUDED.payment_status,
                        updated_at = NOW()
                    "#,
                )
                .bind(id)
                .bind(restaurant_id)
                .bind(order_number)
                .bind(order_type)
                .bind(pickup_ref)
                .bind(status)
                .bind(payment_status)
                .bind(table_id)
                .bind(customer_id)
                .bind(cust_name)
                .bind(cust_phone)
                .bind(subtotal_paise)
                .bind(discount_paise)
                .bind(coupon_code)
                .bind(tax_paise)
                .bind(service_charge_paise)
                .bind(round_off_paise)
                .bind(total_amount_paise)
                .bind(notes)
                .bind(p.get("created_at").and_then(Value::as_str))
                .bind(p.get("seating_session_id").and_then(Value::as_str))
                .execute(&mut *tx)
                .await?;

            if event.event_type == "ORDER_LINES_UPDATED" {
                sqlx::query("UPDATE orders SET subtotal_paise=$2,discount_paise=$3,tax_paise=$4,service_charge_paise=$5,round_off_paise=$6,total_amount_paise=$7,customer_name=$8,customer_phone_e164=$9,notes=$10 WHERE id=$1")
                    .bind(id).bind(subtotal_paise).bind(discount_paise).bind(tax_paise).bind(service_charge_paise).bind(round_off_paise).bind(total_amount_paise).bind(cust_name).bind(cust_phone).bind(notes).execute(&mut *tx).await?;
                sqlx::query("DELETE FROM order_items WHERE order_id=$1")
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
            }
            if let Some(items) = p.get("items").and_then(|v| v.as_array()) {
                for item in items {
                    let item_id = item
                        .get("id")
                        .and_then(|v| v.as_str())
                        .and_then(|s| Uuid::parse_str(s).ok())
                        .ok_or_else(|| sqlx::Error::Protocol("Missing order item ID".into()))?;
                    let menu_item_id = item
                        .get("menu_item_id")
                        .and_then(|v| v.as_str())
                        .and_then(|s| Uuid::parse_str(s).ok());
                    let item_name = item
                        .get("item_name")
                        .or_else(|| item.get("name"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("Dish");
                    let qty = item.get("quantity").and_then(|v| v.as_i64()).unwrap_or(1) as i32;
                    let unit_price = item
                        .get("unit_price_paise")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0);
                    let item_sub = item
                        .get("subtotal_paise")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(unit_price * qty as i64);
                    let item_tax = item.get("tax_paise").and_then(|v| v.as_i64()).unwrap_or(0);
                    let item_disc = item
                        .get("discount_paise")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0);
                    let item_tot = item
                        .get("total_paise")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(item_sub + item_tax - item_disc);
                    let item_notes = item.get("notes").and_then(|v| v.as_str());
                    let item_status = item
                        .get("status")
                        .and_then(|v| v.as_str())
                        .unwrap_or("confirmed");

                    sqlx::query(
                            r#"
                            INSERT INTO order_items (
                                id, order_id, menu_item_id, name, quantity, unit_price_paise,
                                subtotal_paise, tax_paise, discount_paise, total_paise, item_total_paise, notes, status
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $12)
                            ON CONFLICT (id) DO NOTHING
                            "#,
                        )
                        .bind(item_id)
                        .bind(id)
                        .bind(menu_item_id)
                        .bind(item_name)
                        .bind(qty)
                        .bind(unit_price)
                        .bind(item_sub)
                        .bind(item_tax)
                        .bind(item_disc)
                        .bind(item_tot)
                        .bind(item_notes)
                        .bind(item_status)
                        .execute(&mut *tx)
                        .await?;
                }
            }
        }

        "ORDER_STATUS_UPDATED" => {
            let p = &event.payload;
            let to_status = p
                .get("to_status")
                .and_then(|v| v.as_str())
                .unwrap_or("confirmed");
            sqlx::query(
                r#"
                    UPDATE orders
                    SET status = $2, updated_at = NOW()
                    WHERE id = $1
                    "#,
            )
            .bind(event.aggregate_id)
            .bind(to_status)
            .execute(&mut *tx)
            .await?;
        }

        "PAYMENT_SETTLED" => {
            let payment = &event.payload;
            sqlx::query("INSERT INTO payments(id,restaurant_id,order_id,amount_paise,payment_method,status,upi_transaction_ref,idempotency_key,settled_at,created_at)
                    SELECT p.id,p.restaurant_id,p.order_id,p.amount_paise,p.payment_method,p.status,p.upi_transaction_ref,p.idempotency_key,p.settled_at,p.created_at FROM jsonb_populate_record(NULL::payments,$1) p ON CONFLICT(id) DO NOTHING")
                    .bind(payment).execute(&mut *tx).await?;
            if let Some(bill) = payment.get("bill") {
                sqlx::query("UPDATE orders o SET discount_paise=b.discount_paise,tax_paise=b.tax_paise,total_amount_paise=b.total_amount_paise,service_charge_paise=b.service_charge_paise,round_off_paise=b.round_off_paise,applied_coupon_code=b.applied_coupon_code FROM jsonb_populate_record(NULL::orders,$1) b WHERE o.id=(SELECT order_id FROM payments WHERE id=$2)").bind(bill).bind(event.aggregate_id).execute(&mut *tx).await?;
            }
            if payment.get("partial").and_then(Value::as_bool) == Some(true) {
                sqlx::query("UPDATE orders SET payment_status='partial',updated_at=NOW() WHERE id=(SELECT order_id FROM payments WHERE id=$1)").bind(event.aggregate_id).execute(&mut *tx).await?;
            } else {
                sqlx::query("UPDATE orders o SET status='completed',payment_status='paid',payment_method=p.payment_method,settled_at=p.settled_at,updated_at=now() FROM payments p WHERE p.id=$1 AND o.id=p.order_id")
                    .bind(event.aggregate_id).execute(&mut *tx).await?;
            }
        }
        "REFUND_REQUESTED" | "REFUND_STATUS_UPDATED" => {
            let refund = &event.payload;
            sqlx::query("INSERT INTO refunds(id,restaurant_id,order_id,payment_id,refund_amount_paise,reason,status,requested_at,completed_at,cancelled_at,refund_method,idempotency_key)
                    SELECT r.id,r.restaurant_id,r.order_id,r.payment_id,r.refund_amount_paise,r.reason,r.status,r.requested_at,r.completed_at,r.cancelled_at,r.refund_method,r.idempotency_key FROM jsonb_populate_record(NULL::refunds,$1) r
                    ON CONFLICT(id) DO UPDATE SET status=excluded.status,completed_at=excluded.completed_at,cancelled_at=excluded.cancelled_at")
                    .bind(refund).execute(&mut *tx).await?;
            sqlx::query("UPDATE orders o SET payment_status='refunded' WHERE o.id=(SELECT order_id FROM refunds WHERE id=$1) AND (SELECT SUM(r.refund_amount_paise) FROM refunds r WHERE r.order_id=o.id AND r.status='completed')>=o.total_amount_paise")
                    .bind(event.aggregate_id).execute(&mut *tx).await?;
        }
        "INVENTORY_WASTAGE_RECORDED" => {
            let p = &event.payload;
            let wastage_id = p
                .get("wastage_id")
                .and_then(|v| v.as_str())
                .and_then(|s| Uuid::parse_str(s).ok())
                .unwrap_or(event.aggregate_id);
            let restaurant_id = p
                .get("restaurant_id")
                .and_then(|v| v.as_str())
                .and_then(|s| Uuid::parse_str(s).ok());
            let item_id = p
                .get("inventory_item_id")
                .and_then(|v| v.as_str())
                .and_then(|s| Uuid::parse_str(s).ok());
            let quantity = p.get("quantity").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let unit = p
                .get("unit_of_measure")
                .and_then(|v| v.as_str())
                .unwrap_or("kg");
            let cost_impact = p
                .get("cost_impact_paise")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let reason = p
                .get("reason")
                .and_then(|v| v.as_str())
                .unwrap_or("Wastage");

            if let (Some(rid), Some(iid)) = (restaurant_id, item_id) {
                sqlx::query(
                    r#"
                        INSERT INTO wastage_records (
                            id, restaurant_id, inventory_item_id, quantity, unit_of_measure,
                            cost_impact_paise, reason, idempotency_key
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (id) DO NOTHING
                        "#,
                )
                .bind(wastage_id)
                .bind(rid)
                .bind(iid)
                .bind(quantity)
                .bind(unit)
                .bind(cost_impact)
                .bind(reason)
                .bind(&event.idempotency_key)
                .execute(&mut *tx)
                .await?;
            }
        }

        // The durable table publication queue carries both affected table snapshots.
        "TABLE_TRANSFERRED" => {}

        _ => {
            return Err(sqlx::Error::Protocol(format!(
                "Unsupported sync event: {}",
                event.event_type
            )));
        }
    }

    tx.commit().await?;
    Ok(())
}

import os
import sqlite3
from datetime import datetime
from typing import Any

import pandas as pd
import requests
import streamlit as st

st.set_page_config(page_title="AI Quota Tracker", layout="wide")

DEFAULT_API_BASE_URL = os.getenv("QUOTA_API_BASE_URL", "http://127.0.0.1:8787")
DEFAULT_SQLITE_PATH = os.getenv("QUOTA_DB_PATH", "data/quota.db")


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def load_accounts_from_api(base_url: str) -> tuple[list[dict[str, Any]] | None, str | None]:
    base_url = base_url.rstrip("/")

    try:
        response = requests.get(f"{base_url}/api/accounts", timeout=8)
        response.raise_for_status()
        payload = response.json()
        accounts = payload.get("accounts", [])
        if not isinstance(accounts, list):
            return None, "API payload.accounts 형식이 올바르지 않습니다."
        return accounts, None
    except Exception as exc:
        return None, str(exc)


def load_accounts_from_sqlite(db_path: str) -> tuple[list[dict[str, Any]] | None, str | None]:
    if not os.path.exists(db_path):
        return None, f"SQLite 파일이 없습니다: {db_path}"

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row

        account_rows = conn.execute(
            "SELECT id, name, email, last_synced_at FROM accounts ORDER BY CAST(id AS INTEGER), id"
        ).fetchall()
        quota_rows = conn.execute(
            "SELECT account_id, id, model_name, remaining_percentage, refresh_time, source, fetched_at FROM quotas"
        ).fetchall()

        quota_map: dict[str, list[dict[str, Any]]] = {}
        for row in quota_rows:
            quota_map.setdefault(row["account_id"], []).append(
                {
                    "id": row["id"],
                    "modelName": row["model_name"],
                    "remainingPercentage": row["remaining_percentage"],
                    "refreshTime": row["refresh_time"],
                    "source": row["source"],
                    "fetchedAt": row["fetched_at"],
                }
            )

        accounts: list[dict[str, Any]] = []
        for row in account_rows:
            accounts.append(
                {
                    "id": row["id"],
                    "name": row["name"],
                    "email": row["email"],
                    "lastSyncedAt": row["last_synced_at"],
                    "quotas": quota_map.get(row["id"], []),
                }
            )

        return accounts, None
    except Exception as exc:
        return None, str(exc)
    finally:
        try:
            conn.close()
        except Exception:
            pass


def to_report_rows(accounts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for account in accounts:
        quotas = account.get("quotas", []) or []

        model_map: dict[str, float] = {}
        values: list[float] = []

        for quota in quotas:
            model = str(quota.get("modelName", ""))
            value = _safe_float(quota.get("remainingPercentage"))
            if value is None:
                continue
            model_map[model] = value
            values.append(value)

        avg = round(sum(values) / len(values), 1) if values else None

        row = {
            "Account": account.get("name"),
            "Email": account.get("email") or "",
            "Avg Remaining (%)": avg,
            "Critical (<=5%)": sum(1 for v in values if v <= 5),
            "Last Synced": account.get("lastSyncedAt") or "",
        }

        for model, value in sorted(model_map.items(), key=lambda x: x[0]):
            row[model] = value

        rows.append(row)

    return rows


def try_trigger_refresh(base_url: str) -> str | None:
    base_url = base_url.rstrip("/")
    try:
        response = requests.post(f"{base_url}/api/refresh", json={}, timeout=10)
        response.raise_for_status()
        return None
    except Exception as exc:
        return str(exc)


st.title("AI Quota Tracker (Streamlit)")

with st.sidebar:
    st.header("Data Source")
    api_base_url = st.text_input("API Base URL", value=DEFAULT_API_BASE_URL)
    sqlite_path = st.text_input("SQLite Path (fallback)", value=DEFAULT_SQLITE_PATH)
    use_sqlite_fallback = st.checkbox("Use SQLite fallback when API fails", value=True)

    if st.button("API Refresh Trigger"):
        err = try_trigger_refresh(api_base_url)
        if err:
            st.error(f"Refresh 요청 실패: {err}")
        else:
            st.success("Refresh 요청 전송 완료")

accounts, api_err = load_accounts_from_api(api_base_url)

source_used = "API"
if accounts is None and use_sqlite_fallback:
    accounts, sqlite_err = load_accounts_from_sqlite(sqlite_path)
    source_used = "SQLite fallback"
    if accounts is None:
        st.error(f"API 오류: {api_err}")
        st.error(f"SQLite 오류: {sqlite_err}")
        st.stop()

if accounts is None:
    st.error(f"데이터 로드 실패: {api_err}")
    st.stop()

st.caption(f"Source: {source_used} | Loaded at: {datetime.utcnow().isoformat()}Z")

report_rows = to_report_rows(accounts)
if not report_rows:
    st.warning("표시할 quota 데이터가 없습니다.")
    st.stop()

st.subheader("Global Report")
report_df = pd.DataFrame(report_rows)
st.dataframe(report_df, use_container_width=True)

st.subheader("Account Detail")
account_options = {f"{a.get('name')} ({a.get('id')})": a for a in accounts}
selected_key = st.selectbox("계정 선택", options=list(account_options.keys()))
selected = account_options[selected_key]

quota_rows = []
for quota in selected.get("quotas", []) or []:
    quota_rows.append(
        {
            "Model": quota.get("modelName"),
            "Remaining (%)": quota.get("remainingPercentage"),
            "Refresh Time": quota.get("refreshTime"),
            "Source": quota.get("source"),
            "Fetched At": quota.get("fetchedAt"),
        }
    )

if quota_rows:
    st.dataframe(pd.DataFrame(quota_rows), use_container_width=True)
else:
    st.info("선택한 계정의 quota 데이터가 없습니다.")

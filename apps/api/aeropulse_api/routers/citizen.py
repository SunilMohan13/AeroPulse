"""Citizen report APIs (LLD section 25.5). No computer vision in this pass."""

from datetime import UTC, datetime

from aeropulse_auth.jwt import Role, TokenClaims
from aeropulse_common.ids import new_ulid
from aeropulse_common.objects import put_raw_json
from aeropulse_contracts.citizen import CitizenReport
from aeropulse_geospatial.grid import to_grid_id
from aeropulse_intelligence.cv import classify_report
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from aeropulse_api.deps import get_claims, require
from aeropulse_api.event_store import EVENT_STORE

router = APIRouter(prefix="/api/v1/citizen", tags=["citizen"])


class ReportCreate(BaseModel):
    """Citizen observation. cv_class stays unknown until CV ships."""

    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    observation_type: str = "unknown"
    notes: str | None = None


class MediaBody(BaseModel):
    """Logical media attach; bytes go to MinIO when available."""

    filename: str = "photo.jpg"
    content_type: str = "image/jpeg"


@router.post("/reports", status_code=201)
def create_report(
    body: ReportCreate,
    _claims: TokenClaims = Depends(require(Role.CITIZEN, Role.VIEWER, Role.ADMIN)),
) -> dict:
    """Store a citizen report. Does not create a HIGH pollution event."""
    report = CitizenReport(
        report_id=new_ulid("cit"),
        lat=body.lat,
        lon=body.lon,
        observed_at=datetime.now(UTC),
        observation_type=body.observation_type,
        notes=body.notes,
        cv_class="unknown",
        moderation="pending",
        grid_id=to_grid_id(body.lat, body.lon),
    )
    classify_report(report)
    for event in EVENT_STORE.events.values():
        if report.grid_id and report.grid_id in event.grid_ids:
            if event.severity.value not in {"HIGH", "CRITICAL"}:
                report.correlated_event_id = event.event_id
                report.moderation = "accepted"
            break
    EVENT_STORE.citizen_reports[report.report_id] = report
    return report.model_dump(mode="json")


@router.get("/reports")
def list_reports(_claims: TokenClaims = Depends(get_claims)) -> dict:
    """List citizen reports currently held by the API event repository."""
    items = [report.model_dump(mode="json") for report in EVENT_STORE.citizen_reports.values()]
    items.sort(key=lambda report: report["observed_at"], reverse=True)
    return {"items": items, "total": len(items)}


@router.post("/reports/{report_id}/media", responses={404: {"description": "Report not found"}})
def attach_media(
    report_id: str,
    body: MediaBody,
    _claims: TokenClaims = Depends(require(Role.CITIZEN, Role.VIEWER, Role.ADMIN)),
) -> dict:
    """Attach a media object URI (placeholder bytes). CV is not run."""
    report = EVENT_STORE.citizen_reports.get(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    uri = put_raw_json("citizen", body.filename, b"placeholder")
    report.media_uri = uri
    report.moderation = "pending"
    return report.model_dump(mode="json")


@router.get("/reports/{report_id}", responses={404: {"description": "Report not found"}})
def get_report(report_id: str, _claims: TokenClaims = Depends(get_claims)) -> dict:
    """Fetch a citizen report."""
    report = EVENT_STORE.citizen_reports.get(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report.model_dump(mode="json")

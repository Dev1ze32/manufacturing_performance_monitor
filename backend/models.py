from __future__ import annotations

from pydantic import BaseModel


class ActualCostPayload(BaseModel):
    month: str
    utility_cost: float | None = None
    rm_cost: float | None = None
    volume: float | None = None


class OBTargetPayload(BaseModel):
    month: str
    utility_budget: float | None = None
    rm_budget: float | None = None
    volume_budget: float | None = None


class RunrateMonthlyPayload(BaseModel):
    month: str
    line: str
    capacity: float | None = None
    actual_output: float | None = None
    machine_availability: float | None = None


class RunrateWeeklyPayload(BaseModel):
    month: str
    line: str
    week_label: str
    week_num: int | None = None
    capacity: float | None = None
    actual_output: float | None = None
    machine_availability: float | None = None


class ManhoursPayload(BaseModel):
    month: str
    line: str = ""
    working_days: float | None = None
    manpower: float | None = None
    planned_reg: float | None = None
    actual_reg: float | None = None
    planned_ot: float | None = None
    actual_ot: float | None = None
    absenteeism: float | None = None


class SavedResponse(BaseModel):
    ok: bool = True


class DeletedResponse(BaseModel):
    ok: bool = True
    deleted: bool = True

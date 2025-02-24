import uuid
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Column
from sqlmodel import SQLModel, Field

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    hashed_password: str
    permission: int  # 1 (highest) to 3 (lowest)

class CalibrationProject(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    user_id: int = Field(foreign_key="user.id")

class CalibrationLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    # Change project id to string:
    calibration_project_id: str = Field(foreign_key="calibrationproject.id")
    calibration_number: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    measured_temperature: float
    measured_voltage_t1: float
    measured_voltage_t2: float
    measured_voltage_t3: float
    measured_voltage_t4: float

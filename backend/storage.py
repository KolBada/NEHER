"""
Persistent Recording Storage System
Handles folders and recordings in MongoDB
"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field
from bson import ObjectId

# ==============================================================================
# Metrics Version - Bump this when analysis algorithms change
# ==============================================================================
METRICS_VERSION = 2  # Increment when metrics calculations are modified

# ==============================================================================
# Pydantic Models for API
# ==============================================================================

class FolderCreate(BaseModel):
    name: str
    color: Optional[str] = "amber"  # Default folder color
    section_id: Optional[str] = None


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    section_id: Optional[str] = None


class FolderResponse(BaseModel):
    id: str
    name: str
    color: Optional[str] = "amber"
    section_id: Optional[str] = None
    recording_count: int
    created_at: str
    updated_at: str


# Section models
class SectionCreate(BaseModel):
    name: str


class SectionUpdate(BaseModel):
    name: Optional[str] = None
    order: Optional[int] = None
    expanded: Optional[bool] = None


class SectionResponse(BaseModel):
    id: str
    name: str
    order: int
    expanded: bool
    created_at: str
    updated_at: str


class RecordingCreate(BaseModel):
    folder_id: str
    name: str
    filename: str
    # Analysis state
    analysis_state: dict  # Contains all computed metrics, parameters, etc.


class RecordingUpdate(BaseModel):
    name: Optional[str] = None
    analysis_state: Optional[dict] = None


class RecordingMove(BaseModel):
    target_folder_id: str


class RecordingResponse(BaseModel):
    id: str
    folder_id: str
    name: str
    filename: str
    created_at: str
    updated_at: str
    # Summary info for list view
    n_beats: Optional[int] = None
    duration_sec: Optional[float] = None
    has_light_stim: bool = False
    has_drug_analysis: bool = False


class RecordingFullResponse(BaseModel):
    id: str
    folder_id: str
    name: str
    filename: str
    created_at: str
    updated_at: str
    analysis_state: dict


# ==============================================================================
# Database Operations
# ==============================================================================

async def create_folder(db, name: str) -> dict:
    """Create a new folder."""
    now = datetime.now(timezone.utc).isoformat()
    folder = {
        "name": name,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.folders.insert_one(folder)
    folder["_id"] = result.inserted_id
    return {
        "id": str(folder["_id"]),
        "name": folder["name"],
        "recording_count": 0,
        "created_at": folder["created_at"],
        "updated_at": folder["updated_at"],
    }


async def get_folders(db) -> List[dict]:
    """Get all folders with recording counts."""
    folders = []
    # Simple approach - fetch folders first, then count
    folder_list = await db.folders.find().sort("updated_at", -1).to_list(length=100)
    
    for folder in folder_list:
        folder_id_str = str(folder["_id"])
        count = await db.recordings.count_documents({"folder_id": folder_id_str})
        folders.append({
            "id": folder_id_str,
            "name": folder["name"],
            "color": folder.get("color", "amber"),
            "section_id": folder.get("section_id"),
            "recording_count": count,
            "created_at": folder["created_at"],
            "updated_at": folder["updated_at"],
        })
    return folders


async def get_folder(db, folder_id: str) -> Optional[dict]:
    """Get a single folder by ID."""
    try:
        folder = await db.folders.find_one({"_id": ObjectId(folder_id)})
        if not folder:
            return None
        count = await db.recordings.count_documents({"folder_id": folder_id})
        return {
            "id": str(folder["_id"]),
            "name": folder["name"],
            "color": folder.get("color", "amber"),
            "section_id": folder.get("section_id"),
            "recording_count": count,
            "created_at": folder["created_at"],
            "updated_at": folder["updated_at"],
        }
    except Exception:
        return None


async def update_folder(db, folder_id: str, name: str = None, color: str = None, section_id: str = None) -> Optional[dict]:
    """Update a folder's name, color, or section."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        update_fields = {"updated_at": now}
        if name is not None:
            update_fields["name"] = name
        if color is not None:
            update_fields["color"] = color
        if section_id is not None:
            update_fields["section_id"] = section_id if section_id != "" else None
        
        result = await db.folders.update_one(
            {"_id": ObjectId(folder_id)},
            {"$set": update_fields}
        )
        if result.modified_count == 0:
            # Check if folder exists but no changes
            folder = await db.folders.find_one({"_id": ObjectId(folder_id)})
            if folder:
                return await get_folder(db, folder_id)
            return None
        return await get_folder(db, folder_id)
    except Exception:
        return None


async def delete_folder(db, folder_id: str) -> bool:
    """Delete a folder and all its recordings."""
    try:
        # Delete all recordings in this folder
        await db.recordings.delete_many({"folder_id": folder_id})
        # Delete the folder
        result = await db.folders.delete_one({"_id": ObjectId(folder_id)})
        return result.deleted_count > 0
    except Exception:
        return False


async def create_recording(db, folder_id: str, name: str, filename: str, analysis_state: dict) -> dict:
    """Create a new recording in a folder."""
    now = datetime.now(timezone.utc).isoformat()
    
    # Extract summary info from analysis_state
    n_beats = analysis_state.get("metrics", {}).get("n_filtered", 0)
    duration_sec = analysis_state.get("file_info", {}).get("duration_sec", 0)
    has_light_stim = bool(analysis_state.get("light_pulses"))
    has_drug_analysis = bool(analysis_state.get("selected_drugs"))
    
    recording = {
        "folder_id": folder_id,
        "name": name,
        "filename": filename,
        "analysis_state": analysis_state,
        "metrics_version": METRICS_VERSION,  # Track version for auto-updates
        "n_beats": n_beats,
        "duration_sec": duration_sec,
        "has_light_stim": has_light_stim,
        "has_drug_analysis": has_drug_analysis,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.recordings.insert_one(recording)
    
    # Update folder's updated_at
    await db.folders.update_one(
        {"_id": ObjectId(folder_id)},
        {"$set": {"updated_at": now}}
    )
    
    return {
        "id": str(result.inserted_id),
        "folder_id": folder_id,
        "name": name,
        "filename": filename,
        "created_at": now,
        "updated_at": now,
        "n_beats": n_beats,
        "duration_sec": duration_sec,
        "has_light_stim": has_light_stim,
        "has_drug_analysis": has_drug_analysis,
    }


async def get_recordings_in_folder(db, folder_id: str) -> List[dict]:
    """Get all recordings in a folder (without full analysis_state for performance)."""
    recordings = []
    async for rec in db.recordings.find(
        {"folder_id": folder_id},
        {"analysis_state": 0}  # Exclude large analysis_state field
    ).sort("updated_at", -1):
        recordings.append({
            "id": str(rec["_id"]),
            "folder_id": rec["folder_id"],
            "name": rec["name"],
            "filename": rec["filename"],
            "created_at": rec["created_at"],
            "updated_at": rec["updated_at"],
            "n_beats": rec.get("n_beats", 0),
            "duration_sec": rec.get("duration_sec", 0),
            "has_light_stim": rec.get("has_light_stim", False),
            "has_drug_analysis": rec.get("has_drug_analysis", False),
        })
    return recordings


async def get_recording(db, recording_id: str) -> Optional[dict]:
    """Get a single recording with full analysis_state."""
    try:
        rec = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not rec:
            return None
        return {
            "id": str(rec["_id"]),
            "folder_id": rec["folder_id"],
            "name": rec["name"],
            "filename": rec["filename"],
            "created_at": rec["created_at"],
            "updated_at": rec["updated_at"],
            "analysis_state": rec["analysis_state"],
        }
    except Exception:
        return None


async def update_recording(db, recording_id: str, name: Optional[str] = None, analysis_state: Optional[dict] = None, update_version: bool = True) -> Optional[dict]:
    """Update a recording's name and/or analysis_state."""
    try:
        print(f"[DEBUG storage] Attempting to find recording: {recording_id}")
        # First check if the recording exists
        existing = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not existing:
            print(f"[DEBUG storage] Recording not found in DB: {recording_id}")
            return None
        
        print(f"[DEBUG storage] Found recording: {existing.get('name')}")
        now = datetime.now(timezone.utc).isoformat()
        update_fields = {"updated_at": now}
        
        if analysis_state is not None:
            # If we have a new analysis_state, update the name inside it first
            if name is not None:
                analysis_state['recordingName'] = name
            update_fields["analysis_state"] = analysis_state
            # Update summary info
            update_fields["n_beats"] = analysis_state.get("metrics", {}).get("n_filtered", 0)
            update_fields["duration_sec"] = analysis_state.get("file_info", {}).get("duration_sec", 0)
            update_fields["has_light_stim"] = bool(analysis_state.get("light_pulses"))
            update_fields["has_drug_analysis"] = bool(analysis_state.get("selected_drugs"))
            # Update metrics version
            if update_version:
                update_fields["metrics_version"] = METRICS_VERSION
        elif name is not None:
            # Only updating name, no analysis_state - use dot notation
            update_fields["name"] = name
            update_fields["analysis_state.recordingName"] = name
        
        if name is not None:
            update_fields["name"] = name
        
        await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": update_fields}
        )
        
        # Also update folder's updated_at
        await db.folders.update_one(
            {"_id": ObjectId(existing["folder_id"])},
            {"$set": {"updated_at": now}}
        )
        
        result = await get_recording(db, recording_id)
        print(f"[DEBUG storage] Update completed, returning: {result is not None}")
        return result
    except Exception as e:
        print(f"Error updating recording: {e}")
        import traceback
        traceback.print_exc()
        return None


async def delete_recording(db, recording_id: str) -> bool:
    """Delete a recording."""
    try:
        result = await db.recordings.delete_one({"_id": ObjectId(recording_id)})
        return result.deleted_count > 0
    except Exception:
        return False


async def move_recording(db, recording_id: str, target_folder_id: str) -> Optional[dict]:
    """Move a recording to a different folder."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        
        # Verify target folder exists
        target_folder = await db.folders.find_one({"_id": ObjectId(target_folder_id)})
        if not target_folder:
            return None
        
        # Get current recording
        rec = await db.recordings.find_one({"_id": ObjectId(recording_id)})
        if not rec:
            return None
        
        # Check for duplicates in target folder (same filename)
        existing = await db.recordings.find_one({
            "folder_id": target_folder_id,
            "filename": rec["filename"],
            "_id": {"$ne": ObjectId(recording_id)}
        })
        if existing:
            return None  # Duplicate found
        
        # Move the recording
        old_folder_id = rec["folder_id"]
        result = await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {"folder_id": target_folder_id, "updated_at": now}}
        )
        
        if result.modified_count == 0:
            return None
        
        # Update both folders' updated_at
        await db.folders.update_one(
            {"_id": ObjectId(old_folder_id)},
            {"$set": {"updated_at": now}}
        )
        await db.folders.update_one(
            {"_id": ObjectId(target_folder_id)},
            {"$set": {"updated_at": now}}
        )
        
        return await get_recording(db, recording_id)
    except Exception:
        return None


async def check_duplicate_recording(db, folder_id: str, filename: str) -> bool:
    """Check if a recording with the same filename exists in the folder."""
    existing = await db.recordings.find_one({
        "folder_id": folder_id,
        "filename": filename
    })
    return existing is not None



async def get_outdated_recordings(db) -> List[dict]:
    """Get all recordings that have an outdated metrics version or no version."""
    recordings = []
    # Find recordings with old version or no version field (limit to 500 for performance)
    async for rec in db.recordings.find({
        "$or": [
            {"metrics_version": {"$lt": METRICS_VERSION}},
            {"metrics_version": {"$exists": False}}
        ]
    }).limit(500):
        recordings.append({
            "id": str(rec["_id"]),
            "folder_id": rec["folder_id"],
            "name": rec["name"],
            "filename": rec["filename"],
            "analysis_state": rec["analysis_state"],
            "metrics_version": rec.get("metrics_version", 0),
        })
    return recordings


async def update_recording_metrics_version(db, recording_id: str, analysis_state: dict) -> bool:
    """Update a recording's analysis state and set current metrics version."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        result = await db.recordings.update_one(
            {"_id": ObjectId(recording_id)},
            {"$set": {
                "analysis_state": analysis_state,
                "metrics_version": METRICS_VERSION,
                "updated_at": now,
                # Update summary info
                "n_beats": analysis_state.get("metrics", {}).get("n_filtered", 0),
                "duration_sec": analysis_state.get("file_info", {}).get("duration_sec", 0),
                "has_light_stim": bool(analysis_state.get("light_pulses")),
                "has_drug_analysis": bool(analysis_state.get("selected_drugs")),
            }}
        )
        return result.modified_count > 0
    except Exception:
        return False



# ==============================================================================
# Section Operations
# ==============================================================================

async def get_sections(db) -> List[dict]:
    """Get all sections ordered by 'order' field."""
    sections = []
    async for section in db.sections.find().sort("order", 1):
        sections.append({
            "id": str(section["_id"]),
            "name": section["name"],
            "order": section.get("order", 0),
            "expanded": section.get("expanded", True),
            "created_at": section["created_at"],
            "updated_at": section["updated_at"],
        })
    return sections


async def create_section(db, name: str) -> dict:
    """Create a new section."""
    now = datetime.now(timezone.utc).isoformat()
    # Get max order
    max_order_doc = await db.sections.find_one(sort=[("order", -1)])
    max_order = max_order_doc["order"] if max_order_doc else -1
    
    section = {
        "name": name,
        "order": max_order + 1,
        "expanded": True,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.sections.insert_one(section)
    return {
        "id": str(result.inserted_id),
        "name": name,
        "order": max_order + 1,
        "expanded": True,
        "created_at": now,
        "updated_at": now,
    }


async def update_section(db, section_id: str, name: str = None, order: int = None, expanded: bool = None) -> Optional[dict]:
    """Update a section."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        update_fields = {"updated_at": now}
        if name is not None:
            update_fields["name"] = name
        if order is not None:
            update_fields["order"] = order
        if expanded is not None:
            update_fields["expanded"] = expanded
        
        await db.sections.update_one(
            {"_id": ObjectId(section_id)},
            {"$set": update_fields}
        )
        section = await db.sections.find_one({"_id": ObjectId(section_id)})
        if not section:
            return None
        return {
            "id": str(section["_id"]),
            "name": section["name"],
            "order": section.get("order", 0),
            "expanded": section.get("expanded", True),
            "created_at": section["created_at"],
            "updated_at": section["updated_at"],
        }
    except Exception:
        return None


async def delete_section(db, section_id: str) -> bool:
    """Delete a section and unassign folders from it."""
    try:
        # Unassign all folders from this section
        await db.folders.update_many(
            {"section_id": section_id},
            {"$set": {"section_id": None}}
        )
        result = await db.sections.delete_one({"_id": ObjectId(section_id)})
        return result.deleted_count > 0
    except Exception:
        return False


async def reorder_sections(db, section_ids: List[str]) -> bool:
    """Reorder sections based on the provided list of IDs."""
    try:
        for i, section_id in enumerate(section_ids):
            await db.sections.update_one(
                {"_id": ObjectId(section_id)},
                {"$set": {"order": i}}
            )
        return True
    except Exception:
        return False

"""
Data mutation endpoints — apply/undo/download.

These work with the pending_mutations store and the per-dataset undo stack
in upload.py to provide the Preview → Confirm → Undo cycle.
"""
import io
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.models.schemas import ApplyMutationRequest, UndoMutationRequest
from app.routers.upload import datasets, pending_mutations, MAX_UNDO, _touch
from app.services.data_tools import apply_mutation
from app.services.csv_profiler import profile_csv

router = APIRouter(prefix="/api/data", tags=["data"])


@router.post("/apply")
async def apply_data_mutation(request: ApplyMutationRequest):
    """Apply a previously previewed mutation to the dataset."""
    if request.dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if request.preview_id not in pending_mutations:
        raise HTTPException(status_code=404, detail="Preview not found or already applied")

    _touch(request.dataset_id)
    ds = datasets[request.dataset_id]
    df = ds["df"]

    mutation = pending_mutations.pop(request.preview_id)
    if mutation["dataset_id"] != request.dataset_id:
        raise HTTPException(status_code=400, detail="Preview does not belong to this dataset")

    action = mutation["action"]
    args = mutation["args"]

    # Push current DataFrame onto undo stack (capped at MAX_UNDO)
    undo_stack: list = ds.get("undo_stack", [])
    undo_stack.append(df.copy())
    if len(undo_stack) > MAX_UNDO:
        undo_stack.pop(0)
    ds["undo_stack"] = undo_stack

    # Apply the mutation
    try:
        new_df, description = apply_mutation(df, action, args)
    except Exception as e:
        # Rollback: pop the snapshot we just pushed
        undo_stack.pop()
        raise HTTPException(status_code=500, detail=f"Mutation failed: {str(e)}")

    # Update the dataset entry
    ds["df"] = new_df
    new_profile = profile_csv(new_df, ds["filename"])
    ds["profile"] = new_profile
    ds["profile_dict"] = new_profile.model_dump()

    # Log the mutation
    log: list = ds.get("mutation_log", [])
    log.append(description)
    ds["mutation_log"] = log

    return {
        "success": True,
        "description": description,
        "profile": ds["profile_dict"],
        "rows": len(new_df),
        "columns": len(new_df.columns),
        "can_undo": len(undo_stack) > 0,
        "mutation_count": len(log),
    }


@router.post("/undo")
async def undo_last_mutation(request: UndoMutationRequest):
    """Undo the last applied mutation by restoring the previous DataFrame."""
    if request.dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found")

    _touch(request.dataset_id)
    ds = datasets[request.dataset_id]
    undo_stack: list = ds.get("undo_stack", [])

    if not undo_stack:
        raise HTTPException(status_code=400, detail="Nothing to undo")

    # Pop the previous DataFrame
    previous_df = undo_stack.pop()
    ds["df"] = previous_df
    ds["undo_stack"] = undo_stack

    # Re-profile
    new_profile = profile_csv(previous_df, ds["filename"])
    ds["profile"] = new_profile
    ds["profile_dict"] = new_profile.model_dump()

    # Pop the last log entry
    log: list = ds.get("mutation_log", [])
    undone_action = log.pop() if log else "unknown action"
    ds["mutation_log"] = log

    return {
        "success": True,
        "description": f"Undid: {undone_action}",
        "profile": ds["profile_dict"],
        "rows": len(previous_df),
        "columns": len(previous_df.columns),
        "can_undo": len(undo_stack) > 0,
        "mutation_count": len(log),
    }


@router.get("/download/{dataset_id}")
async def download_csv(dataset_id: str):
    """Download the current (possibly mutated) DataFrame as CSV."""
    if dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found")

    _touch(dataset_id)
    ds = datasets[dataset_id]
    df = ds["df"]
    filename = ds.get("filename", "data.csv")

    # Add "_cleaned" suffix if mutations were applied
    mutation_log = ds.get("mutation_log", [])
    if mutation_log:
        name_parts = filename.rsplit(".", 1)
        if len(name_parts) == 2:
            filename = f"{name_parts[0]}_cleaned.{name_parts[1]}"
        else:
            filename = f"{filename}_cleaned"

    # Stream the CSV to avoid loading the entire string into memory at once
    buffer = io.StringIO()
    df.to_csv(buffer, index=False)
    buffer.seek(0)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/history/{dataset_id}")
async def get_mutation_history(dataset_id: str):
    """Get the mutation history and undo status for a dataset."""
    if dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found")

    ds = datasets[dataset_id]
    return {
        "mutation_log": ds.get("mutation_log", []),
        "can_undo": len(ds.get("undo_stack", [])) > 0,
        "undo_depth": len(ds.get("undo_stack", [])),
    }

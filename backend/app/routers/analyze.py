import traceback
from fastapi import APIRouter, HTTPException
from app.services.llm_service import suggest_visualizations
from app.services.data_tools import create_chart_data
from app.routers.upload import datasets, _touch

router = APIRouter(prefix="/api", tags=["analyze"])


@router.get("/analyze/{dataset_id}")
async def analyze_dataset(dataset_id: str):
    if dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found")

    _touch(dataset_id)
    dataset = datasets[dataset_id]
    profile = dataset.get("profile_dict") or dataset["profile"].model_dump()
    sample_rows = profile["sample_rows"]
    df = dataset["df"]

    try:
        raw_suggestions = suggest_visualizations(profile, sample_rows)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")

    # Convert LLM query specs into real chart configs by running against the DataFrame
    suggestions = []
    for spec in raw_suggestions:
        try:
            chart_type = spec.get("chart_type", "bar")
            x_column = spec.get("x_column", "")
            y_columns = spec.get("y_columns", [])
            group_by = spec.get("group_by")
            aggregation = spec.get("aggregation", "sum")
            filters = spec.get("filters", [])
            limit = spec.get("limit", 20)
            colors = spec.get("colors")

            # If the spec already has a chart_config with data (old format), use it directly
            if "chart_config" in spec and isinstance(spec["chart_config"], dict):
                chart_config = spec["chart_config"]
                if isinstance(chart_config.get("data"), list) and len(chart_config["data"]) > 0:
                    suggestions.append({
                        "title": spec.get("title", chart_config.get("title", "Chart")),
                        "description": spec.get("description", ""),
                        "chart_config": chart_config,
                    })
                    continue

            if not x_column or not y_columns:
                print(f"[analyze] Skipping suggestion '{spec.get('title')}': missing x_column or y_columns")
                continue

            # Execute the query against the real DataFrame
            chart_config = create_chart_data(
                df=df,
                chart_type=chart_type,
                x_column=x_column,
                y_columns=y_columns,
                group_by=group_by if isinstance(group_by, str) else None,
                aggregation=aggregation,
                filters=filters if isinstance(filters, list) else None,
                limit=limit,
                colors=colors if isinstance(colors, list) else None,
            )

            if "error" in chart_config:
                print(f"[analyze] Chart generation error for '{spec.get('title')}': {chart_config['error']}")
                continue

            # Override the auto-generated title with the LLM's friendly title
            if spec.get("title"):
                chart_config["title"] = spec["title"]

            suggestions.append({
                "title": spec.get("title", chart_config.get("title", "Chart")),
                "description": spec.get("description", ""),
                "chart_config": chart_config,
            })
        except Exception as e:
            print(f"[analyze] Failed to build chart for suggestion '{spec.get('title', '?')}': {e}")
            traceback.print_exc()
            continue

    return {
        "dataset_id": dataset_id,
        "suggestions": suggestions,
    }

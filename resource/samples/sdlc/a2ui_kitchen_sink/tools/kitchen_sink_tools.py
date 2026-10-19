"""
A2UI Kitchen Sink Python Tools (TASK-241).

Exposes typed tool functions for the Kitchen Sink Coordinator and specialized sub-agents:
1. `get_current_form_state`: Retrieves the active or initial session state configuration.
2. `submit_and_persist_form`: Validates and commits submitted form parameters into agent memory,
   computes budget breakdown metrics, and produces the A2UI final summary surface.
3. `render_kitchen_sink_surface`: Deterministically returns requested A2UI surfaces (gallery, wizard, summary).
4. `reset_form_state`, `get_help_documentation`, `get_about_metadata`: Deterministic utility helpers.

Author: Mike Nimer <mikenimer@google.com>
"""

import copy
import datetime
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

# ============================================================================
# Consolidated from a2ui_component.py
# ============================================================================
from typing import Any, Dict, List, Optional, Union

# Standard A2UI Catalog Identifiers
MATERIAL_CATALOG_ID = "https://a2ui.org/specification/v0_9/material_catalog.json"
COMPOSITE_CATALOG_ID = (
    "https://www.gstatic.com/vertexaisearch/a2ui/v0_9/gemini_enterprise_composite_catalog.json"
)


class A2UIComponent:
    """
    Base class for all A2UI v0.9.1 declarative UI components.

    Each component possesses a unique identifier, a catalog type string,
    component properties, and an optional list of child component identifiers.
    """

    def __init__(
        self,
        component_id: str,
        component: str,
        properties: Optional[Dict[str, Any]] = None,
        children: Optional[List[str]] = None,
    ):
        """
        Initializes an A2UI component instance.

        Args:
            component_id: Unique string ID within the A2UI surface.
            component: Component type name (e.g., 'Card', 'Column', 'Text').
            properties: Dictionary of component visual and behavioral attributes.
            children: List of child component ID strings.
        """
        self.id = component_id
        self.component = component
        self.properties = properties or {}
        self.children = children or []

    def to_dict(self) -> Dict[str, Any]:
        """
        Serializes the component into an A2UI v0.9.1 dictionary.

        Returns:
            Dictionary matching the A2UI specification for components.
        """
        data: Dict[str, Any] = {
            "id": self.id,
            "component": self.component,
        }
        if self.properties:
            data["properties"] = self.properties
        if self.children:
            data["children"] = self.children
        return data


# ============================================================================
# Layout Components
# ============================================================================


class MaterialCard(A2UIComponent):
    """Card container with optional title, subtitle, elevation, and child layout."""

    def __init__(
        self,
        component_id: str,
        title: Optional[str] = None,
        subtitle: Optional[str] = None,
        children: Optional[List[str]] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        if title:
            props["title"] = title
        if subtitle:
            props["subtitle"] = subtitle
        super().__init__(component_id, "Card", props, children)


class MaterialColumn(A2UIComponent):
    """Vertical flex layout container with spacing and child ordering."""

    def __init__(
        self,
        component_id: str,
        children: Optional[List[str]] = None,
        spacing: int = 8,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["spacing"] = spacing
        super().__init__(component_id, "Column", props, children)


class MaterialRow(A2UIComponent):
    """Horizontal flex layout container with spacing and cross-axis alignment."""

    def __init__(
        self,
        component_id: str,
        children: Optional[List[str]] = None,
        spacing: int = 8,
        align_items: str = "center",
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["spacing"] = spacing
        props["alignItems"] = align_items
        super().__init__(component_id, "Row", props, children)


class MaterialGridList(A2UIComponent):
    """Responsive grid container with column count and tile spacing."""

    def __init__(
        self,
        component_id: str,
        columns: int = 2,
        spacing: int = 8,
        children: Optional[List[str]] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["columns"] = columns
        props["spacing"] = spacing
        super().__init__(component_id, "GridList", props, children)


class MaterialExpansionPanel(A2UIComponent):
    """Collapsible accordion panel with a header title and expandable body."""

    def __init__(
        self,
        component_id: str,
        title: str,
        children: Optional[List[str]] = None,
        expanded: bool = False,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["title"] = title
        props["expanded"] = expanded
        super().__init__(component_id, "ExpansionPanel", props, children)


class MaterialDivider(A2UIComponent):
    """Visual horizontal separator line."""

    def __init__(self, component_id: str, properties: Optional[Dict[str, Any]] = None):
        super().__init__(component_id, "Divider", properties or {}, [])


class MaterialTabs(A2UIComponent):
    """Tabbed navigation container hosting panel content."""

    def __init__(
        self,
        component_id: str,
        tabs: Optional[List[Dict[str, Any]]] = None,
        active_tab: int = 0,
        children: Optional[List[str]] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["tabs"] = tabs or []
        props["activeTab"] = active_tab
        super().__init__(component_id, "Tabs", props, children)


class MaterialDialog(A2UIComponent):
    """Modal dialog container with title, content, and action buttons."""

    def __init__(
        self,
        component_id: str,
        title: str,
        children: Optional[List[str]] = None,
        open_state: bool = True,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["title"] = title
        props["open"] = open_state
        super().__init__(component_id, "Dialog", props, children)


# ============================================================================
# Content & Feedback Components
# ============================================================================


class MaterialText(A2UIComponent):
    """Typography element supporting heading and body variants."""

    def __init__(
        self,
        component_id: str,
        text: str,
        variant: str = "body1",
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["text"] = text
        props["variant"] = variant
        super().__init__(component_id, "Text", props, [])


class MaterialBadge(A2UIComponent):
    """Severity or category pill badge (e.g. PRIMARY, SUCCESS, WARNING, CRITICAL)."""

    def __init__(
        self,
        component_id: str,
        text: str,
        color: str = "primary",
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["text"] = text
        props["color"] = color
        super().__init__(component_id, "Badge", props, [])


class MaterialIcon(A2UIComponent):
    """Standard Material Symbols icon element."""

    def __init__(
        self,
        component_id: str,
        icon_name: str,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["iconName"] = icon_name
        super().__init__(component_id, "Icon", props, [])


class MaterialImage(A2UIComponent):
    """Image element with source URL, alt text, and aspect ratio."""

    def __init__(
        self,
        component_id: str,
        src: str,
        alt: Optional[str] = None,
        width: Optional[Union[int, str]] = None,
        height: Optional[Union[int, str]] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["src"] = src
        if alt:
            props["alt"] = alt
        if width is not None:
            props["width"] = width
        if height is not None:
            props["height"] = height
        super().__init__(component_id, "Image", props, [])


class MaterialProgressBar(A2UIComponent):
    """Linear progress bar supporting determinate and indeterminate modes."""

    def __init__(
        self,
        component_id: str,
        value: Optional[float] = None,
        max_val: float = 100,
        mode: str = "determinate",
        color: str = "primary",
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["mode"] = mode
        props["max"] = max_val
        props["color"] = color
        if value is not None:
            props["value"] = value
        super().__init__(component_id, "ProgressBar", props, [])


class MaterialProgressSpinner(A2UIComponent):
    """Circular progress indicator."""

    def __init__(
        self,
        component_id: str,
        diameter: int = 32,
        mode: str = "indeterminate",
        color: str = "primary",
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["diameter"] = diameter
        props["mode"] = mode
        props["color"] = color
        super().__init__(component_id, "ProgressSpinner", props, [])


# ============================================================================
# Action Components
# ============================================================================


class MaterialButton(A2UIComponent):
    """Interactive button element dispatching an A2UI UserAction event."""

    def __init__(
        self,
        component_id: str,
        label: str,
        action: Optional[Dict[str, Any]] = None,
        variant: str = "contained",
        color: str = "primary",
        icon: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["label"] = label
        props["variant"] = variant
        props["color"] = color
        if icon:
            props["icon"] = icon
        if action:
            props["action"] = action
        super().__init__(component_id, "Button", props, [])


class MaterialButtonToggle(A2UIComponent):
    """Segmented button group toggle."""

    def __init__(
        self,
        component_id: str,
        options: Optional[List[Dict[str, str]]] = None,
        value_path: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["options"] = options or []
        if value_path:
            props["value"] = {"path": value_path}
        super().__init__(component_id, "ButtonToggle", props, [])


# ============================================================================
# Two-Way Bound Input Components
# ============================================================================


class MaterialInput(A2UIComponent):
    """Editable text, number, email, or password input bound to an A2UI data model path."""

    def __init__(
        self,
        component_id: str,
        label: str,
        value_path: Optional[str] = None,
        placeholder: Optional[str] = None,
        input_type: str = "text",
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["label"] = label
        props["inputType"] = input_type
        if value_path:
            props["value"] = {"path": value_path}
        if placeholder:
            props["placeholder"] = placeholder
        super().__init__(component_id, "Input", props, [])


class MaterialSelect(A2UIComponent):
    """Dropdown selection menu bound to an A2UI data model path."""

    def __init__(
        self,
        component_id: str,
        label: str,
        value_path: Optional[str] = None,
        options: Optional[List[Dict[str, str]]] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["label"] = label
        props["options"] = options or []
        if value_path:
            props["value"] = {"path": value_path}
        super().__init__(component_id, "Select", props, [])


class MaterialRadioButton(A2UIComponent):
    """Radio button group bound to an A2UI data model path."""

    def __init__(
        self,
        component_id: str,
        label: str,
        value_path: Optional[str] = None,
        options: Optional[List[Dict[str, str]]] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["label"] = label
        props["options"] = options or []
        if value_path:
            props["value"] = {"path": value_path}
        super().__init__(component_id, "RadioButton", props, [])


class MaterialCheckbox(A2UIComponent):
    """Boolean toggle checkbox bound to data model path."""

    def __init__(
        self,
        component_id: str,
        label: str,
        checked_path: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["label"] = label
        if checked_path:
            props["checked"] = {"path": checked_path}
        super().__init__(component_id, "Checkbox", props, [])


class MaterialSlideToggle(A2UIComponent):
    """Switch slide toggle component bound to boolean data model path."""

    def __init__(
        self,
        component_id: str,
        label: str,
        checked_path: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["label"] = label
        if checked_path:
            props["checked"] = {"path": checked_path}
        super().__init__(component_id, "SlideToggle", props, [])


class MaterialChips(A2UIComponent):
    """Interactive chip set for tags, filters, or multiple selections."""

    def __init__(
        self,
        component_id: str,
        label: str,
        chips: Optional[List[Dict[str, Any]]] = None,
        value_path: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["label"] = label
        props["chips"] = chips or []
        if value_path:
            props["value"] = {"path": value_path}
        super().__init__(component_id, "Chips", props, [])


class MaterialSlider(A2UIComponent):
    """Continuous or stepped numeric range slider bound to data model."""

    def __init__(
        self,
        component_id: str,
        label: str,
        value_path: Optional[str] = None,
        min_val: float = 0,
        max_val: float = 100,
        step: float = 1,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["label"] = label
        props["min"] = min_val
        props["max"] = max_val
        props["step"] = step
        if value_path:
            props["value"] = {"path": value_path}
        super().__init__(component_id, "Slider", props, [])


class MaterialDatepicker(A2UIComponent):
    """Date selector field bound to date string data model path."""

    def __init__(
        self,
        component_id: str,
        label: str,
        value_path: Optional[str] = None,
        placeholder: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["label"] = label
        if value_path:
            props["value"] = {"path": value_path}
        if placeholder:
            props["placeholder"] = placeholder
        super().__init__(component_id, "Datepicker", props, [])


class MaterialTimepicker(A2UIComponent):
    """Time selector field bound to time string data model path."""

    def __init__(
        self,
        component_id: str,
        label: str,
        value_path: Optional[str] = None,
        placeholder: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["label"] = label
        if value_path:
            props["value"] = {"path": value_path}
        if placeholder:
            props["placeholder"] = placeholder
        super().__init__(component_id, "Timepicker", props, [])


# ============================================================================
# Data & Composite Components (Gemini Enterprise Composite Catalog)
# ============================================================================


class MaterialTable(A2UIComponent):
    """Structured data table with columns definition and row records."""

    def __init__(
        self,
        component_id: str,
        columns: Optional[List[Dict[str, Any]]] = None,
        rows: Optional[List[Dict[str, Any]]] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["columns"] = columns or []
        props["rows"] = rows or []
        super().__init__(component_id, "Table", props, [])


class RichTable(A2UIComponent):
    """Enhanced enterprise table supporting badges, actions, and sorting."""

    def __init__(
        self,
        component_id: str,
        columns: Optional[List[Dict[str, Any]]] = None,
        rows: Optional[List[Dict[str, Any]]] = None,
        title: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        if title:
            props["title"] = title
        props["columns"] = columns or []
        props["rows"] = rows or []
        super().__init__(component_id, "RichTable", props, [])


class Stepper(A2UIComponent):
    """Multi-step process indicator showing current and completed progress."""

    def __init__(
        self,
        component_id: str,
        steps: Optional[List[Dict[str, Any]]] = None,
        active_step: int = 1,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["steps"] = steps or []
        props["activeStep"] = active_step
        super().__init__(component_id, "Stepper", props, [])


class VegaChart(A2UIComponent):
    """Composite data visualization chart executing a Vega-Lite v5 specification."""

    def __init__(
        self,
        component_id: str,
        spec: Dict[str, Any],
        title: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["spec"] = spec
        if title:
            props["title"] = title
        super().__init__(component_id, "VegaChart", props, [])


class InteractiveChart(A2UIComponent):
    """Interactive chart with data points, drill-downs, and range controls."""

    def __init__(
        self,
        component_id: str,
        chart_type: str = "bar",
        data: Optional[List[Dict[str, Any]]] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["chartType"] = chart_type
        props["data"] = data or []
        super().__init__(component_id, "InteractiveChart", props, [])


class GoogleMap(A2UIComponent):
    """Geographic map component with markers, center coordinates, and zoom."""

    def __init__(
        self,
        component_id: str,
        center: Optional[Dict[str, float]] = None,
        zoom: int = 10,
        markers: Optional[List[Dict[str, Any]]] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["center"] = center or {"lat": 37.422, "lng": -122.084}
        props["zoom"] = zoom
        props["markers"] = markers or []
        super().__init__(component_id, "GoogleMap", props, [])


class MosaicCarousel(A2UIComponent):
    """Horizontal slide card carousel for browsing items."""

    def __init__(
        self,
        component_id: str,
        children: Optional[List[str]] = None,
        title: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        if title:
            props["title"] = title
        super().__init__(component_id, "MosaicCarousel", props, children)


class MosaicSlideCard(A2UIComponent):
    """Individual slide item card inside a MosaicCarousel."""

    def __init__(
        self,
        component_id: str,
        title: str,
        subtitle: Optional[str] = None,
        image_url: Optional[str] = None,
        action: Optional[Dict[str, Any]] = None,
        children: Optional[List[str]] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["title"] = title
        if subtitle:
            props["subtitle"] = subtitle
        if image_url:
            props["imageUrl"] = image_url
        if action:
            props["action"] = action
        super().__init__(component_id, "MosaicSlideCard", props, children)


class WorkOrderList(A2UIComponent):
    """Structured list of tickets, jobs, or work orders."""

    def __init__(
        self,
        component_id: str,
        items: Optional[List[Dict[str, Any]]] = None,
        title: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        if title:
            props["title"] = title
        props["items"] = items or []
        super().__init__(component_id, "WorkOrderList", props, [])


class RightPanelForm(A2UIComponent):
    """Slide-over drawer or side panel containing a form layout."""

    def __init__(
        self,
        component_id: str,
        title: str,
        children: Optional[List[str]] = None,
        properties: Optional[Dict[str, Any]] = None,
    ):
        props = dict(properties or {})
        props["title"] = title
        super().__init__(component_id, "RightPanelForm", props, children)


# ============================================================================
# Surface Envelope Builder
# ============================================================================


class A2uiSurfaceBuilder:
    """
    Fluent builder class for composing and generating complete A2UI v0.9.1 surface envelopes.
    """

    def __init__(
        self,
        surface_id: str,
        catalog_id: str = COMPOSITE_CATALOG_ID,
        title: Optional[str] = None,
    ):
        """
        Initializes an A2uiSurfaceBuilder.

        Args:
            surface_id: Unique string identifying the UI surface.
            catalog_id: Schema catalog URI for validation and rendering.
            title: Human-readable surface title.
        """
        self.surface_id = surface_id
        self.catalog_id = catalog_id
        self.title = title
        self.root_id: Optional[str] = None
        self.components: List[Union[A2UIComponent, Dict[str, Any]]] = []
        self.data_model: Dict[str, Any] = {}

    def set_root(self, root_id: str) -> "A2uiSurfaceBuilder":
        """Sets the root component ID."""
        self.root_id = root_id
        return self

    def add_component(self, component: Union[A2UIComponent, Dict[str, Any]]) -> "A2uiSurfaceBuilder":
        """Adds a component to the surface."""
        self.components.append(component)
        return self

    def add_components(self, components: List[Union[A2UIComponent, Dict[str, Any]]]) -> "A2uiSurfaceBuilder":
        """Appends multiple components to the surface."""
        self.components.extend(components)
        return self

    def set_data_model(self, data: Dict[str, Any]) -> "A2uiSurfaceBuilder":
        """Sets the initial reactive data model."""
        self.data_model = dict(data)
        return self

    def update_data_model_value(self, path: str, value: Any) -> "A2uiSurfaceBuilder":
        """Updates a single path in the data model."""
        self.data_model[path.lstrip("/")] = value
        return self

    def build(self) -> Dict[str, Any]:
        """
        Emits standard createSurface, updateComponents, and updateDataModel messages.

        Returns:
            Dictionary matching the A2UI v0.9.1 envelope specification.
        """
        effective_root = self.root_id or (
            self.components[0].id if isinstance(self.components[0], A2UIComponent) else self.components[0].get("id")
        )
        return build_a2ui_surface(
            surface_id=self.surface_id,
            root_id=effective_root,
            components=self.components,
            data_model=self.data_model,
            catalog_id=self.catalog_id,
        )

    def to_part(self) -> Dict[str, Any]:
        """Wraps the built surface into an A2A DataPart envelope."""
        return create_a2ui_part(self.build())


def build_a2ui_surface(
    surface_id: str,
    root_id: str,
    components: List[Union[A2UIComponent, Dict[str, Any]]],
    data_model: Optional[Dict[str, Any]] = None,
    catalog_id: str = COMPOSITE_CATALOG_ID,
) -> Dict[str, Any]:
    """
    Constructs an A2UI v0.9.1 surface envelope containing lifecycle messages.

    Emits `createSurface`, `updateComponents`, and `updateDataModel` messages
    as defined by the A2UI runtime protocol.

    Args:
        surface_id: Unique string identifying the UI surface.
        root_id: The identifier of the root component rendered on the surface.
        components: List of A2UIComponent objects or serialized component dicts.
        data_model: Optional dictionary representing initial reactive state.
        catalog_id: Schema catalog URI for validation and rendering.

    Returns:
        A dictionary containing standard A2UI v0.9.1 messages.
    """
    # Section 1: Serialize components to pure dictionaries
    serialized_components = [
        c.to_dict() if isinstance(c, A2UIComponent) else c for c in components
    ]

    # Section 2: Assemble A2UI standard messages
    messages = [
        {
            "createSurface": {
                "surfaceId": surface_id,
                "catalogId": catalog_id,
                "rootId": root_id,
                "rootComponentId": root_id,
            }
        },
        {
            "updateComponents": {
                "surfaceId": surface_id,
                "rootId": root_id,
                "components": serialized_components,
            }
        },
        {
            "updateDataModel": {
                "surfaceId": surface_id,
                "data": data_model or {},
            }
        },
    ]

    return {"messages": messages}


def create_a2ui_part(surface_payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Wraps an A2UI surface message envelope into an A2A DataPart with proper MIME type.

    Args:
        surface_payload: The dictionary produced by build_a2ui_surface().

    Returns:
        DataPart dictionary with MIME type 'application/a2ui+json'.
    """
    return {
        "mimeType": "application/a2ui+json",
        "data": surface_payload,
    }

# ============================================================================
# Consolidated from widget_gallery_ui.py
# ============================================================================
from typing import Any, Dict, List, Optional


def build_widget_gallery_surface(
    state: Optional[Dict[str, Any]] = None,
    section: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Constructs the comprehensive A2UI Component Gallery surface, or a focused
    showcase surface for a specific widget category when `section` is specified.

    Args:
        state: Optional active agent session state for initial values.
        section: Optional section filter ('map', 'charts', 'badges', 'carousel',
            'layout', 'tables', 'forms', or None/'gallery' for the full showcase).

    Returns:
        Standard A2UI v0.9.1 surface dictionary with messages array.
    """
    state = state or {}
    surface_id = "kitchen-sink-gallery"
    root_id = "gallery-root"
    norm_section = (section or "").strip().lower()

    # Initial data model with reactive demonstration values
    data_model: Dict[str, Any] = {
        "demo": {
            "textInput": "Agent Workbench v1.2.0",
            "selectTier": "enterprise",
            "radioRole": "coordinator",
            "checkboxFlag": True,
            "toggleArmor": True,
            "sliderScore": 88,
            "chipsCapabilities": ["search", "code_execution", "a2ui"],
            "datepickerLaunch": "2026-11-15",
            "timepickerWindow": "03:30",
        },
        "metrics": {
            "cpuPct": 42,
            "memoryPct": 68,
        },
    }

    # Section 1: Stepper & Header
    stepper = Stepper(
        component_id="gallery-stepper",
        steps=[
            {"id": "step-1", "title": "Layout & Typo", "status": "completed"},
            {"id": "step-2", "title": "Form Controls", "status": "completed"},
            {"id": "step-3", "title": "Data & Charts", "status": "active"},
            {"id": "step-4", "title": "Interactive Carousel", "status": "pending"},
        ],
        active_step=3,
    )

    header_card = MaterialCard(
        component_id="gallery-header-card",
        title="A2UI v0.9.1 Kitchen Sink Component Gallery",
        subtitle="Catalog Specification: gemini_enterprise_composite_v09 & material_v09",
        children=["gallery-header-col"],
    )

    header_col = MaterialColumn(
        component_id="gallery-header-col",
        children=["gallery-stepper", "gallery-header-desc", "gallery-action-row"],
        spacing=8,
    )

    header_desc = MaterialText(
        component_id="gallery-header-desc",
        text=(
            "Welcome to the Visual Agent Designer A2UI Component Showcase. "
            "Every widget below renders interactively in the IDE Chat Runner and "
            "supports two-way data binding with session.state."
        ),
        variant="body2",
    )

    action_row = MaterialRow(
        component_id="gallery-action-row",
        children=["btn-launch-wizard", "btn-view-summary", "btn-refresh-gallery"],
        spacing=8,
    )

    btn_launch_wizard = MaterialButton(
        component_id="btn-launch-wizard",
        label="Launch 3-Step Configuration Wizard",
        variant="contained",
        color="primary",
        action={"name": "show_wizard", "context": {}},
    )

    btn_view_summary = MaterialButton(
        component_id="btn-view-summary",
        label="Inspect Session State Summary",
        variant="outlined",
        color="secondary",
        action={"name": "show_summary", "context": {}},
    )

    btn_refresh_gallery = MaterialButton(
        component_id="btn-refresh-gallery",
        label="Show Full Gallery",
        variant="outlined",
        action={"name": "show_gallery", "context": {}},
    )

    # Section 2: Layout, Badges, Feedback & Typography Showcase
    layout_card = MaterialCard(
        component_id="card-layout-showcase",
        title="1. Layout, Containers, Badges & Feedback",
        subtitle="Card, Column, Row, ExpansionPanel, Divider, Tabs, Text, Badge, Icon, ProgressBar & ProgressSpinner",
        children=["col-layout-content"],
    )

    badge_row = MaterialRow(
        component_id="row-badges",
        children=["badge-1", "badge-2", "badge-3", "badge-4", "badge-5"],
        spacing=8,
    )

    badge_1 = MaterialBadge(component_id="badge-1", text="PRIMARY", color="primary")
    badge_2 = MaterialBadge(component_id="badge-2", text="SUCCESS", color="success")
    badge_3 = MaterialBadge(component_id="badge-3", text="WARNING", color="warning")
    badge_4 = MaterialBadge(component_id="badge-4", text="CRITICAL", color="error")
    badge_5 = MaterialBadge(component_id="badge-5", text="A2UI v0.9.1", color="info")

    icon_row = MaterialRow(
        component_id="row-icons",
        children=["icon-star", "text-icon-label", "icon-bolt", "icon-shield", "icon-check"],
        spacing=8,
    )
    icon_star = MaterialIcon(component_id="icon-star", icon_name="star")
    text_icon_label = MaterialText(component_id="text-icon-label", text="Material Symbols & Telemetry Icons:")
    icon_bolt = MaterialIcon(component_id="icon-bolt", icon_name="bolt")
    icon_shield = MaterialIcon(component_id="icon-shield", icon_name="shield")
    icon_check = MaterialIcon(component_id="icon-check", icon_name="check")

    progress_row = MaterialColumn(
        component_id="row-progress",
        children=["prog-bar", "prog-bar-cpu", "prog-spin"],
        spacing=8,
    )
    prog_bar = MaterialProgressBar(
        component_id="prog-bar",
        value=68,
        max_val=100,
        properties={"label": "Model Inference Memory Utilization"},
    )
    prog_bar_cpu = MaterialProgressBar(
        component_id="prog-bar-cpu",
        value=42,
        max_val=100,
        properties={"label": "Global Context Cache Quota"},
    )
    prog_spin = MaterialProgressSpinner(
        component_id="prog-spin",
        diameter=24,
        properties={"label": "Live Telemetry Stream Active"},
    )

    tabs_demo = MaterialTabs(
        component_id="tabs-demo",
        tabs=[
            {
                "id": "tab-1",
                "label": "Architecture",
                "content": "Declarative A2UI v0.9.1 surface tree combining Material 3 containers (Card, Row, Column, Tabs, ExpansionPanel) with zero procedural DOM manipulation.",
            },
            {
                "id": "tab-2",
                "label": "Security",
                "content": "Strict JSON Schema payload validation with Google Model Armor guardrails and sandboxed React component rendering.",
            },
            {
                "id": "tab-3",
                "label": "Observability",
                "content": "Every UserAction event and two-way /dataModel mutation is traced with OpenTelemetry spans and persisted via ADK state_delta.",
            },
        ],
        active_tab=0,
    )

    expansion_panel = MaterialExpansionPanel(
        component_id="exp-panel-info",
        title="Deep Dive: A2UI Reactive Protocol & Declarative Lifecycles",
        expanded=True,
        children=["exp-panel-text"],
    )
    exp_panel_text = MaterialText(
        component_id="exp-panel-text",
        text=(
            "A2UI surfaces communicate over JSON message envelopes (createSurface, "
            "updateComponents, updateDataModel, deleteSurface). Input components mutate "
            "local dataModel via RFC 6901 JSON pointers, and buttons dispatch resolved context."
        ),
        variant="body2",
    )

    col_layout_content = MaterialColumn(
        component_id="col-layout-content",
        children=[
            "row-badges",
            "row-icons",
            "row-progress",
            "tabs-demo",
            "exp-panel-info",
        ],
        spacing=8,
    )

    # Section 3: Interactive Form Controls
    form_card = MaterialCard(
        component_id="card-form-controls",
        title="2. Interactive Two-Way Bound Form Controls",
        subtitle="Input, Select, RadioButton, Checkbox, SlideToggle, Chips, Slider, Datepicker, Timepicker",
        children=["col-form-content"],
    )

    input_text = MaterialInput(
        component_id="ctrl-input-text",
        label="Agent Identifier",
        value_path="/demo/textInput",
        placeholder="e.g. enterprise-copilot-v1",
    )

    select_tier = MaterialSelect(
        component_id="ctrl-select-tier",
        label="Service Tier",
        value_path="/demo/selectTier",
        options=[
            {"label": "Developer Sandbox", "value": "developer"},
            {"label": "Enterprise Standard", "value": "enterprise"},
            {"label": "Mission Critical HA", "value": "mission_critical"},
        ],
    )

    radio_role = MaterialRadioButton(
        component_id="ctrl-radio-role",
        label="Agent Orchestration Role",
        value_path="/demo/radioRole",
        options=[
            {"label": "Coordinator Root", "value": "coordinator"},
            {"label": "Autonomous Worker", "value": "worker"},
            {"label": "Synthesizer", "value": "synthesizer"},
        ],
    )

    row_toggles = MaterialRow(
        component_id="row-form-toggles",
        children=["ctrl-checkbox", "ctrl-slidetoggle"],
        spacing=16,
    )
    ctrl_checkbox = MaterialCheckbox(
        component_id="ctrl-checkbox",
        label="Enable Multi-Turn Session Memory",
        checked_path="/demo/checkboxFlag",
    )
    ctrl_slidetoggle = MaterialSlideToggle(
        component_id="ctrl-slidetoggle",
        label="Google Model Armor Guardrails",
        checked_path="/demo/toggleArmor",
    )

    ctrl_chips = MaterialChips(
        component_id="ctrl-chips",
        label="Enabled ADK Capabilities",
        value_path="/demo/chipsCapabilities",
        chips=[
            {"id": "search", "label": "Google Search", "selected": True},
            {"id": "code_execution", "label": "Code Execution", "selected": True},
            {"id": "bigquery", "label": "BigQuery Data", "selected": False},
            {"id": "a2ui", "label": "A2UI v0.9.1", "selected": True},
        ],
    )

    ctrl_slider = MaterialSlider(
        component_id="ctrl-slider",
        label="Confidence Threshold Score (%)",
        value_path="/demo/sliderScore",
        min_val=0,
        max_val=100,
        step=1,
    )

    row_pickers = MaterialRow(
        component_id="row-pickers",
        children=["ctrl-datepicker", "ctrl-timepicker"],
        spacing=8,
    )
    ctrl_datepicker = MaterialDatepicker(
        component_id="ctrl-datepicker",
        label="Scheduled Production Launch",
        value_path="/demo/datepickerLaunch",
    )
    ctrl_timepicker = MaterialTimepicker(
        component_id="ctrl-timepicker",
        label="Daily Maintenance Window (UTC)",
        value_path="/demo/timepickerWindow",
    )

    col_form_content = MaterialColumn(
        component_id="col-form-content",
        children=[
            "ctrl-input-text",
            "ctrl-select-tier",
            "ctrl-radio-role",
            "row-form-toggles",
            "ctrl-chips",
            "ctrl-slider",
            "row-pickers",
        ],
        spacing=8,
    )

    # Section 4: Data Tables & Work Orders
    data_card = MaterialCard(
        component_id="card-data-tables",
        title="3. Data Tables & Work Order List",
        subtitle="MaterialTable, RichTable & WorkOrderList",
        children=["col-data-content"],
    )

    rich_table = RichTable(
        component_id="table-service-catalog",
        title="Active Service Workloads & Latency SLA",
        columns=[
            {"id": "service", "label": "Service Name"},
            {"id": "region", "label": "GCP Region"},
            {"id": "qps", "label": "Peak QPS"},
            {"id": "status", "label": "Health Status"},
        ],
        rows=[
            {"service": "adk-orchestrator", "region": "global", "qps": "2,450", "status": "HEALTHY"},
            {"service": "alloydb-vector-idx", "region": "us-central1", "qps": "1,120", "status": "HEALTHY"},
            {"service": "model-armor-filter", "region": "global", "qps": "3,800", "status": "OPTIMAL"},
            {"service": "session-memory-bank", "region": "us-central1", "qps": "890", "status": "HEALTHY"},
        ],
    )

    work_orders = WorkOrderList(
        component_id="list-work-orders",
        title="Pending Architectural Work Orders",
        items=[
            {
                "id": "WO-1082",
                "title": "Upgrade Agent Runtime to v1.2.0",
                "priority": "HIGH",
                "assignee": "mikenimer@google.com",
            },
            {
                "id": "WO-1085",
                "title": "Provision Model Armor Enterprise Baseline",
                "priority": "MEDIUM",
                "assignee": "security-ops@example.com",
            },
        ],
    )

    col_data_content = MaterialColumn(
        component_id="col-data-content",
        children=["table-service-catalog", "list-work-orders"],
        spacing=8,
    )

    # Section 5: Vega-Lite Chart & Geographic Map
    chart_card = MaterialCard(
        component_id="card-charts-geo",
        title="4. Vega-Lite v5 Data Visualization & Geographic Map",
        subtitle="Interactive VegaChart (Bar & Donut) and GoogleMap components",
        children=["col-charts-content"],
    )

    vega_spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "title": "Weekly Agent Evaluation Scores by Category",
        "description": "Multi-category benchmark results across 5 evaluation runs.",
        "width": "container",
        "height": 180,
        "data": {
            "values": [
                {"category": "Reasoning", "score": 94},
                {"category": "Grounding", "score": 91},
                {"category": "Safety", "score": 99},
                {"category": "Tool Accuracy", "score": 88},
                {"category": "Latency SLA", "score": 85},
            ]
        },
        "mark": "bar",
        "encoding": {
            "x": {"field": "category", "type": "nominal", "axis": {"labelAngle": 0}},
            "y": {"field": "score", "type": "quantitative"},
            "color": {"value": "#6366f1"},
        },
    }

    vega_chart = VegaChart(
        component_id="chart-eval-scores",
        spec=vega_spec,
        title="Weekly Agent Evaluation Benchmark (Bar Chart)",
    )

    vega_donut_spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "title": "Inference Token & Compute Distribution",
        "description": "Share of monthly token consumption by subsystem.",
        "width": "container",
        "height": 180,
        "data": {
            "values": [
                {"category": "Coordinator Reasoning", "value": 45},
                {"category": "RAG & Vector Grounding", "value": 25},
                {"category": "Tool Execution & A2UI", "value": 20},
                {"category": "Model Armor Guardrails", "value": 10},
            ]
        },
        "mark": "arc",
        "encoding": {
            "theta": {"field": "value", "type": "quantitative"},
            "color": {"field": "category", "type": "nominal"},
        },
    }

    vega_donut_chart = VegaChart(
        component_id="chart-token-distribution",
        spec=vega_donut_spec,
        title="Token & Compute Distribution (Arc / Donut Chart)",
    )

    vega_pie_spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "title": "Regional Traffic Share by Cloud Hub",
        "description": "Proportional share of A2UI agent sessions across deployment regions.",
        "width": "container",
        "height": 180,
        "data": {
            "values": [
                {"category": "us-west1 (SF Primary)", "value": 38},
                {"category": "us-central1 (Iowa)", "value": 29},
                {"category": "us-east4 (Virginia)", "value": 21},
                {"category": "us-south1 (Dallas)", "value": 12},
            ]
        },
        "mark": "pie",
        "encoding": {
            "theta": {"field": "value", "type": "quantitative"},
            "color": {"field": "category", "type": "nominal"},
        },
    }

    vega_pie_chart = VegaChart(
        component_id="chart-regional-pie",
        spec=vega_pie_spec,
        title="Regional Request Share by Hub (Pie Chart)",
    )

    vega_line_spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "title": "P95 Inference Latency Trend (ms)",
        "description": "End-to-end streaming response latency across release milestones.",
        "width": "container",
        "height": 180,
        "data": {
            "values": [
                {"category": "v1.0", "latency": 640},
                {"category": "v1.1", "latency": 520},
                {"category": "v1.2", "latency": 430},
                {"category": "v1.3", "latency": 350},
                {"category": "v1.4", "latency": 290},
            ]
        },
        "mark": "line",
        "encoding": {
            "x": {"field": "category", "type": "nominal"},
            "y": {"field": "latency", "type": "quantitative"},
            "color": {"value": "#10b981"},
        },
    }

    vega_line_chart = VegaChart(
        component_id="chart-latency-line",
        spec=vega_line_spec,
        title="P95 Inference Latency Trend (Line Chart)",
    )

    google_map = GoogleMap(
        component_id="map-deployment-nodes",
        center={"lat": 38.5000, "lng": -98.0000},
        zoom=4,
        markers=[
            {"lat": 37.7749, "lng": -122.4194, "title": "Primary Region (us-west1 SF)", "status": "ACTIVE PRIMARY"},
            {"lat": 32.7767, "lng": -96.7970, "title": "South Hub (us-south1 Dallas)", "status": "STANDBY HA"},
            {"lat": 41.2619, "lng": -95.8608, "title": "Central Hub (us-central1 Iowa)", "status": "ACTIVE"},
            {"lat": 38.8951, "lng": -77.0364, "title": "East Coast Edge (us-east4 VA)", "status": "ACTIVE"},
        ],
        properties={"title": "Multi-Region Agent Deployment Topology"},
    )

    col_charts_content = MaterialColumn(
        component_id="col-charts-content",
        children=[
            "chart-eval-scores",
            "chart-token-distribution",
            "chart-regional-pie",
            "chart-latency-line",
            "map-deployment-nodes",
        ],
        spacing=8,
    )

    # Section 6: Mosaic Carousel Showcase
    carousel_card = MaterialCard(
        component_id="card-carousel",
        title="5. Mosaic Carousel & Interactive Slide Cards",
        subtitle="Horizontal multi-item card carousel with hero imagery & actions",
        children=["carousel-demo"],
    )

    carousel_demo = MosaicCarousel(
        component_id="carousel-demo",
        title="Recommended Agent Blueprints",
        children=["slide-1", "slide-2", "slide-3", "slide-4"],
    )

    slide_1 = MosaicSlideCard(
        component_id="slide-1",
        title="Merchandising Workbench",
        subtitle="Demospace 1876 Retail Coordinator",
        image_url="https://picsum.photos/seed/a2ui-merchandising/400/220",
        action={"name": "show_merchandising_info", "context": {"sample": "merchandising"}},
        properties={
            "badge": "RETAIL AI",
            "description": "Real-time inventory stockout radar, regional store map, and purchase order dialog.",
            "actionLabel": "Open Wizard",
        },
    )

    slide_2 = MosaicSlideCard(
        component_id="slide-2",
        title="Knowledge Catalog Domain Builder",
        subtitle="Dataplex Universal Catalog Assistant",
        image_url="https://picsum.photos/seed/a2ui-catalog/400/220",
        action={"name": "show_kc_info", "context": {"sample": "kc_data_domain"}},
        properties={
            "badge": "DATA GOVERNANCE",
            "description": "Automated data product curation, BigQuery schema discovery, and PII tagging.",
            "actionLabel": "Inspect State",
        },
    )

    slide_3 = MosaicSlideCard(
        component_id="slide-3",
        title="A2UI 3-Step Form Wizard",
        subtitle="Multi-Step Interactive Configuration",
        image_url="https://picsum.photos/seed/a2ui-wizard/400/220",
        action={"name": "show_wizard", "context": {"step": 1}},
        properties={
            "badge": "INTERACTIVE FORM",
            "description": "Two-way JSON pointer bindings across 12 controls with session.state persistence.",
            "actionLabel": "Launch Wizard",
        },
    )

    slide_4 = MosaicSlideCard(
        component_id="slide-4",
        title="Cloud FinOps & Security War Room",
        subtitle="Blast Radius & Quota Remediation",
        image_url="https://picsum.photos/seed/a2ui-finops/400/220",
        action={"name": "show_summary", "context": {"sample": "finops_war_room"}},
        properties={
            "badge": "CLOUD SECOPS",
            "description": "Live BigQuery egress spike charts, IAM quarantine toggles, and budget enforcement.",
            "actionLabel": "View Budget Summary",
        },
    )

    # Focused section filtering when the user requests a specific widget showcase
    if norm_section in ("map", "google_map", "googlemap", "geo"):
        map_showcase_card = MaterialCard(
            component_id="card-map-focused",
            title="A2UI Geographic Map Showcase (GoogleMap)",
            subtitle="Interactive multi-region deployment pin map with zoom controls and node inspection",
            children=["map-deployment-nodes", "gallery-action-row"],
        )
        focused_root = MaterialColumn(
            component_id=root_id,
            children=["card-map-focused"],
            spacing=8,
        )
        return build_a2ui_surface(
            surface_id=surface_id,
            root_id=root_id,
            components=[
                focused_root,
                map_showcase_card,
                google_map,
                action_row,
                btn_launch_wizard,
                btn_view_summary,
                btn_refresh_gallery,
            ],
            data_model=data_model,
            catalog_id=COMPOSITE_CATALOG_ID,
        )

    if norm_section in ("chart", "charts", "vega", "vegalite", "vega-lite", "pie", "donut", "bar", "line"):
        charts_showcase_card = MaterialCard(
            component_id="card-charts-focused",
            title="A2UI Vega-Lite v5 Data Visualization Showcase",
            subtitle="Interactive Vertical Bar Chart, Circular Donut Chart, Circular Pie Chart, and Line/Area Chart",
            children=[
                "chart-eval-scores",
                "chart-token-distribution",
                "chart-regional-pie",
                "chart-latency-line",
                "gallery-action-row",
            ],
        )
        focused_root = MaterialColumn(
            component_id=root_id,
            children=["card-charts-focused"],
            spacing=8,
        )
        return build_a2ui_surface(
            surface_id=surface_id,
            root_id=root_id,
            components=[
                focused_root,
                charts_showcase_card,
                vega_chart,
                vega_donut_chart,
                vega_pie_chart,
                vega_line_chart,
                action_row,
                btn_launch_wizard,
                btn_view_summary,
                btn_refresh_gallery,
            ],
            data_model=data_model,
            catalog_id=COMPOSITE_CATALOG_ID,
        )

    if norm_section in ("badge", "badges", "feedback", "progress", "spinner", "icons"):
        badges_showcase_card = MaterialCard(
            component_id="card-badges-focused",
            title="A2UI Badges, Icons & Progress Feedback Showcase",
            subtitle="MaterialBadge semantic status pills, MaterialIcon symbols, MaterialProgressBar & MaterialProgressSpinner",
            children=["row-badges", "row-icons", "row-progress", "gallery-action-row"],
        )
        focused_root = MaterialColumn(
            component_id=root_id,
            children=["card-badges-focused"],
            spacing=8,
        )
        return build_a2ui_surface(
            surface_id=surface_id,
            root_id=root_id,
            components=[
                focused_root,
                badges_showcase_card,
                badge_row,
                badge_1,
                badge_2,
                badge_3,
                badge_4,
                badge_5,
                icon_row,
                icon_star,
                text_icon_label,
                icon_bolt,
                icon_shield,
                icon_check,
                progress_row,
                prog_bar,
                prog_bar_cpu,
                prog_spin,
                action_row,
                btn_launch_wizard,
                btn_view_summary,
                btn_refresh_gallery,
            ],
            data_model=data_model,
            catalog_id=COMPOSITE_CATALOG_ID,
        )

    if norm_section in ("carousel", "mosaic", "mosaic_carousel", "slides"):
        carousel_showcase_card = MaterialCard(
            component_id="card-carousel-focused",
            title="A2UI Mosaic Carousel & Interactive Slide Cards",
            subtitle="Horizontal multi-item card carousel with Lorem Picsum hero imagery, badges, and actions",
            children=["carousel-demo", "gallery-action-row"],
        )
        focused_root = MaterialColumn(
            component_id=root_id,
            children=["card-carousel-focused"],
            spacing=8,
        )
        return build_a2ui_surface(
            surface_id=surface_id,
            root_id=root_id,
            components=[
                focused_root,
                carousel_showcase_card,
                carousel_demo,
                slide_1,
                slide_2,
                slide_3,
                slide_4,
                action_row,
                btn_launch_wizard,
                btn_view_summary,
                btn_refresh_gallery,
            ],
            data_model=data_model,
            catalog_id=COMPOSITE_CATALOG_ID,
        )

    if norm_section in ("layout", "containers", "tabs", "accordion", "expansion", "stepper"):
        layout_focused_card = MaterialCard(
            component_id="card-layout-focused",
            title="A2UI Layout & Structural Containers Showcase",
            subtitle="Stepper, MaterialTabs, MaterialExpansionPanel (Accordion), MaterialRow, MaterialColumn & MaterialDivider",
            children=[
                "gallery-stepper",
                "tabs-demo",
                "exp-panel-info",
                "row-badges",
                "gallery-action-row",
            ],
        )
        focused_root = MaterialColumn(
            component_id=root_id,
            children=["card-layout-focused"],
            spacing=8,
        )
        return build_a2ui_surface(
            surface_id=surface_id,
            root_id=root_id,
            components=[
                focused_root,
                layout_focused_card,
                stepper,
                tabs_demo,
                expansion_panel,
                exp_panel_text,
                badge_row,
                badge_1,
                badge_2,
                badge_3,
                badge_4,
                badge_5,
                action_row,
                btn_launch_wizard,
                btn_view_summary,
                btn_refresh_gallery,
            ],
            data_model=data_model,
            catalog_id=COMPOSITE_CATALOG_ID,
        )

    if norm_section in ("table", "tables", "work_orders", "workorders", "richtable"):
        tables_focused_card = MaterialCard(
            component_id="card-tables-focused",
            title="A2UI Data Tables & Work Order List Showcase",
            subtitle="RichTable with status pills and WorkOrderList with priority badges",
            children=["table-service-catalog", "list-work-orders", "gallery-action-row"],
        )
        focused_root = MaterialColumn(
            component_id=root_id,
            children=["card-tables-focused"],
            spacing=8,
        )
        return build_a2ui_surface(
            surface_id=surface_id,
            root_id=root_id,
            components=[
                focused_root,
                tables_focused_card,
                rich_table,
                work_orders,
                action_row,
                btn_launch_wizard,
                btn_view_summary,
                btn_refresh_gallery,
            ],
            data_model=data_model,
            catalog_id=COMPOSITE_CATALOG_ID,
        )

    if norm_section in ("forms", "inputs", "controls"):
        forms_focused_card = MaterialCard(
            component_id="card-forms-focused",
            title="A2UI Two-Way Bound Form Controls Showcase",
            subtitle="Input, Select, RadioButton, Checkbox, SlideToggle, Chips, Slider, Datepicker & Timepicker",
            children=["col-form-content", "gallery-action-row"],
        )
        focused_root = MaterialColumn(
            component_id=root_id,
            children=["card-forms-focused"],
            spacing=8,
        )
        return build_a2ui_surface(
            surface_id=surface_id,
            root_id=root_id,
            components=[
                focused_root,
                forms_focused_card,
                col_form_content,
                input_text,
                select_tier,
                radio_role,
                row_toggles,
                ctrl_checkbox,
                ctrl_slidetoggle,
                ctrl_chips,
                ctrl_slider,
                row_pickers,
                ctrl_datepicker,
                ctrl_timepicker,
                action_row,
                btn_launch_wizard,
                btn_view_summary,
                btn_refresh_gallery,
            ],
            data_model=data_model,
            catalog_id=COMPOSITE_CATALOG_ID,
        )

    # Section 7: Root assembly (full gallery)
    div_1 = MaterialDivider(component_id="div-1")
    div_2 = MaterialDivider(component_id="div-2")
    div_3 = MaterialDivider(component_id="div-3")
    div_4 = MaterialDivider(component_id="div-4")

    gallery_root = MaterialColumn(
        component_id=root_id,
        children=[
            "gallery-header-card",
            "div-1",
            "card-layout-showcase",
            "div-2",
            "card-form-controls",
            "div-3",
            "card-data-tables",
            "card-charts-geo",
            "div-4",
            "card-carousel",
        ],
        spacing=8,
    )

    all_components: List[A2UIComponent] = [
        gallery_root,
        # Header
        header_card,
        header_col,
        stepper,
        header_desc,
        action_row,
        btn_launch_wizard,
        btn_view_summary,
        btn_refresh_gallery,
        # Section 2
        div_1,
        layout_card,
        col_layout_content,
        badge_row,
        badge_1,
        badge_2,
        badge_3,
        badge_4,
        badge_5,
        icon_row,
        icon_star,
        text_icon_label,
        icon_bolt,
        icon_shield,
        icon_check,
        progress_row,
        prog_bar,
        prog_bar_cpu,
        prog_spin,
        tabs_demo,
        expansion_panel,
        exp_panel_text,
        # Section 3
        div_2,
        form_card,
        col_form_content,
        input_text,
        select_tier,
        radio_role,
        row_toggles,
        ctrl_checkbox,
        ctrl_slidetoggle,
        ctrl_chips,
        ctrl_slider,
        row_pickers,
        ctrl_datepicker,
        ctrl_timepicker,
        # Section 4
        div_3,
        data_card,
        col_data_content,
        rich_table,
        work_orders,
        # Section 5
        chart_card,
        col_charts_content,
        vega_chart,
        vega_donut_chart,
        vega_pie_chart,
        vega_line_chart,
        google_map,
        # Section 6
        div_4,
        carousel_card,
        carousel_demo,
        slide_1,
        slide_2,
        slide_3,
        slide_4,
    ]

    return build_a2ui_surface(
        surface_id=surface_id,
        root_id=root_id,
        components=all_components,
        data_model=data_model,
        catalog_id=COMPOSITE_CATALOG_ID,
    )

# ============================================================================
# Consolidated from form_wizard_ui.py
# ============================================================================
from typing import Any, Dict, List, Optional


def get_default_form_values() -> Dict[str, Any]:
    """Returns the standardized default dictionary for all 12 form fields."""
    return {
        "agentName": "enterprise-copilot-v1",
        "ownerEmail": "architect@example.com",
        "environment": "staging",
        "reasoningTier": "balanced",
        "capabilities": ["search", "code_execution", "bigquery", "a2ui"],
        "computeBudgetUsd": 2500,
        "confidenceThreshold": 85,
        "enableModelArmor": True,
        "requireHitlApproval": True,
        "launchDate": "2026-11-01",
        "maintenanceWindow": "02:00",
        "notes": "Initial kitchen sink configuration",
    }


def build_form_wizard_surface(
    state: Optional[Dict[str, Any]] = None,
    active_step: int = 1,
) -> Dict[str, Any]:
    """
    Constructs the interactive multi-step configuration form wizard surface.

    Args:
        state: Optional active agent session state to pre-populate inputs.
        active_step: Active step index (1, 2, or 3). Defaults to 1.

    Returns:
        Standard A2UI v0.9.1 surface dictionary with messages array.
    """
    state = state or {}
    surface_id = "kitchen-sink-form-wizard"
    root_id = "form-wizard-root"

    # Merge session state submitted form values if previously committed
    current_submission = state.get("kitchen_sink_submission") or {}
    defaults = get_default_form_values()
    merged_form = {**defaults, **current_submission}

    data_model: Dict[str, Any] = {
        "form": merged_form,
        "wizard": {
            "activeStep": active_step,
        },
    }

    # Header with Stepper
    stepper = Stepper(
        component_id="wizard-stepper",
        steps=[
            {
                "id": "step-1",
                "title": "Identity & Selectors",
                "status": "active" if active_step == 1 else ("completed" if active_step > 1 else "pending"),
            },
            {
                "id": "step-2",
                "title": "Sliders, Toggles & Schedule",
                "status": "active" if active_step == 2 else ("completed" if active_step > 2 else "pending"),
            },
            {
                "id": "step-3",
                "title": "Resource Allocation & Submit",
                "status": "active" if active_step == 3 else ("completed" if active_step > 3 else "pending"),
            },
            {
                "id": "step-4",
                "title": "Persisted in session.state",
                "status": "pending",
            },
        ],
        active_step=active_step,
    )

    header_card = MaterialCard(
        component_id="wizard-header-card",
        title="Interactive Multi-Step Agent Configuration Wizard",
        subtitle="Two-Way Data Bound Form Mutating session.state across Turns",
        children=["wizard-header-col"],
    )

    wizard_header_col = MaterialColumn(
        component_id="wizard-header-col",
        children=["wizard-stepper", "wizard-header-desc"],
        spacing=8,
    )

    wizard_header_desc = MaterialText(
        component_id="wizard-header-desc",
        text=(
            "Configure agent properties across Identity, Guardrails, and Resource Allocation. "
            "All inputs are bound via RFC 6901 JSON pointers under '/form/...'. Clicking "
            "'Submit Form to Agent Memory' resolves and persists all 12 fields into session.state!"
        ),
        variant="body2",
    )

    # Step 1 Card: Identity & Selectors
    step1_card = MaterialCard(
        component_id="card-step-1",
        title="Step 1: Agent Identity & Operational Selectors",
        subtitle="Name, Owner, Environment, Reasoning Tier, and Capabilities",
        children=["col-step-1"],
    )

    inp_name = MaterialInput(
        component_id="form-inp-name",
        label="Agent System Name",
        value_path="/form/agentName",
        placeholder="enterprise-copilot-v1",
    )

    inp_email = MaterialInput(
        component_id="form-inp-email",
        label="Lead Architect / Owner Email",
        value_path="/form/ownerEmail",
        placeholder="architect@example.com",
    )

    sel_env = MaterialSelect(
        component_id="form-sel-env",
        label="Deployment Environment",
        value_path="/form/environment",
        options=[
            {"label": "Development Sandbox", "value": "development"},
            {"label": "Staging / Pre-Production", "value": "staging"},
            {"label": "Production Global HA", "value": "production"},
        ],
    )

    radio_tier = MaterialRadioButton(
        component_id="form-radio-tier",
        label="Reasoning & Thinking Budget Tier",
        value_path="/form/reasoningTier",
        options=[
            {"label": "Fast (Low latency, zero thinking budget)", "value": "fast"},
            {"label": "Balanced (Standard reasoning loop)", "value": "balanced"},
            {"label": "Deep Think (Maximum thinking budget + PlanReAct)", "value": "deep_think"},
        ],
    )

    chips_cap = MaterialChips(
        component_id="form-chips-cap",
        label="Agent Active Capabilities",
        value_path="/form/capabilities",
        chips=[
            {"id": "search", "label": "Google Search Grounding", "selected": "search" in merged_form.get("capabilities", [])},
            {"id": "code_execution", "label": "Code Execution Sandbox", "selected": "code_execution" in merged_form.get("capabilities", [])},
            {"id": "bigquery", "label": "BigQuery Analytics", "selected": "bigquery" in merged_form.get("capabilities", [])},
            {"id": "a2ui", "label": "A2UI v0.9.1 Surface Renderer", "selected": "a2ui" in merged_form.get("capabilities", [])},
        ],
    )

    col_step1 = MaterialColumn(
        component_id="col-step-1",
        children=["form-inp-name", "form-inp-email", "form-sel-env", "form-radio-tier", "form-chips-cap"],
        spacing=8,
    )

    # Step 2 Card: Sliders, Toggles & Schedule
    step2_card = MaterialCard(
        component_id="card-step-2",
        title="Step 2: Sliders, Guardrails & Maintenance Schedule",
        subtitle="Confidence Threshold, Model Armor, HITL Approval, Date & Time",
        children=["col-step-2"],
    )

    slider_conf = MaterialSlider(
        component_id="form-slider-conf",
        label="Confidence Threshold (%)",
        value_path="/form/confidenceThreshold",
        min_val=50,
        max_val=99,
        step=1,
    )

    row_step2_toggles = MaterialRow(
        component_id="row-step2-toggles",
        children=["form-toggle-armor", "form-chk-hitl"],
        spacing=16,
    )
    toggle_armor = MaterialSlideToggle(
        component_id="form-toggle-armor",
        label="Enable Google Cloud Model Armor",
        checked_path="/form/enableModelArmor",
    )
    chk_hitl = MaterialCheckbox(
        component_id="form-chk-hitl",
        label="Require Human-in-the-Loop (HITL) for Tool Executions",
        checked_path="/form/requireHitlApproval",
    )

    row_step2_pickers = MaterialRow(
        component_id="row-step2-pickers",
        children=["form-date-launch", "form-time-maint"],
        spacing=8,
    )
    date_launch = MaterialDatepicker(
        component_id="form-date-launch",
        label="Production Go-Live Launch Date",
        value_path="/form/launchDate",
    )
    time_maint = MaterialTimepicker(
        component_id="form-time-maint",
        label="Scheduled Daily Maintenance Window (UTC)",
        value_path="/form/maintenanceWindow",
    )

    col_step2 = MaterialColumn(
        component_id="col-step-2",
        children=["form-slider-conf", "row-step2-toggles", "row-step2-pickers"],
        spacing=8,
    )

    # Step 3 Card: Resource Allocation & Submit
    step3_card = MaterialCard(
        component_id="card-step-3",
        title="Step 3: Resource Allocation & Submission",
        subtitle="Monthly Compute Budget (USD), Architectural Notes, and Commit Action",
        children=["col-step-3"],
    )

    slider_budget = MaterialSlider(
        component_id="form-slider-budget",
        label="Monthly Compute Budget ($ USD)",
        value_path="/form/computeBudgetUsd",
        min_val=100,
        max_val=10000,
        step=100,
    )

    inp_notes = MaterialInput(
        component_id="form-inp-notes",
        label="Deployment & Configuration Notes",
        value_path="/form/notes",
        placeholder="Enter release notes, change justifications, or review comments...",
    )

    # Crucial Submit Button with ALL 12 /form/... context bindings!
    submit_context_bindings = {
        "agentName": {"path": "/form/agentName"},
        "ownerEmail": {"path": "/form/ownerEmail"},
        "environment": {"path": "/form/environment"},
        "reasoningTier": {"path": "/form/reasoningTier"},
        "capabilities": {"path": "/form/capabilities"},
        "computeBudgetUsd": {"path": "/form/computeBudgetUsd"},
        "confidenceThreshold": {"path": "/form/confidenceThreshold"},
        "enableModelArmor": {"path": "/form/enableModelArmor"},
        "requireHitlApproval": {"path": "/form/requireHitlApproval"},
        "launchDate": {"path": "/form/launchDate"},
        "maintenanceWindow": {"path": "/form/maintenanceWindow"},
        "notes": {"path": "/form/notes"},
    }

    btn_submit = MaterialButton(
        component_id="btn-submit-kitchen-sink-form",
        label="Submit Form to Agent Memory (session.state)",
        variant="contained",
        color="primary",
        action={
            "name": "submit_kitchen_sink_form",
            "context": submit_context_bindings,
        },
    )

    btn_draft = MaterialButton(
        component_id="btn-save-draft",
        label="Save Draft in Memory",
        variant="outlined",
        color="secondary",
        action={
            "name": "save_step_draft",
            "context": submit_context_bindings,
        },
    )

    btn_cancel = MaterialButton(
        component_id="btn-view-gallery",
        label="Cancel & Back to Gallery",
        variant="outlined",
        action={"name": "show_gallery", "context": {}},
    )

    row_submit_actions = MaterialRow(
        component_id="row-submit-actions",
        children=["btn-submit-kitchen-sink-form", "btn-save-draft", "btn-view-gallery"],
        spacing=8,
    )

    col_step3 = MaterialColumn(
        component_id="col-step-3",
        children=["form-slider-budget", "form-inp-notes", "row-submit-actions"],
        spacing=8,
    )

    # Root Assembly
    div_w1 = MaterialDivider(component_id="div-w1")
    div_w2 = MaterialDivider(component_id="div-w2")
    div_w3 = MaterialDivider(component_id="div-w3")

    wizard_root = MaterialColumn(
        component_id=root_id,
        children=[
            "wizard-header-card",
            "div-w1",
            "card-step-1",
            "div-w2",
            "card-step-2",
            "div-w3",
            "card-step-3",
        ],
        spacing=8,
    )

    all_components: List[A2UIComponent] = [
        wizard_root,
        # Header
        header_card,
        wizard_header_col,
        stepper,
        wizard_header_desc,
        # Step 1
        div_w1,
        step1_card,
        col_step1,
        inp_name,
        inp_email,
        sel_env,
        radio_tier,
        chips_cap,
        # Step 2
        div_w2,
        step2_card,
        col_step2,
        slider_conf,
        row_step2_toggles,
        toggle_armor,
        chk_hitl,
        row_step2_pickers,
        date_launch,
        time_maint,
        # Step 3
        div_w3,
        step3_card,
        col_step3,
        slider_budget,
        inp_notes,
        row_submit_actions,
        btn_submit,
        btn_draft,
        btn_cancel,
    ]

    return build_a2ui_surface(
        surface_id=surface_id,
        root_id=root_id,
        components=all_components,
        data_model=data_model,
        catalog_id=COMPOSITE_CATALOG_ID,
    )

# ============================================================================
# Consolidated from final_summary_ui.py
# ============================================================================
import json
from typing import Any, Dict, List, Optional


def compute_budget_breakdown(budget_usd: float) -> List[Dict[str, Any]]:
    """Calculates budget breakdown categories based on submitted computeBudgetUsd."""
    return [
        {"category": "LLM Inference (Gemini 3.8)", "allocation": round(budget_usd * 0.50, 2), "pct": 50},
        {"category": "Enterprise Search Grounding", "allocation": round(budget_usd * 0.20, 2), "pct": 20},
        {"category": "Session Memory Bank & Vector Store", "allocation": round(budget_usd * 0.15, 2), "pct": 15},
        {"category": "Model Armor & Guardrail Filters", "allocation": round(budget_usd * 0.15, 2), "pct": 15},
    ]


def build_final_summary_surface(state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Constructs the Final Summary and session.state Inspector surface.

    Args:
        state: Optional active agent session state containing committed form submission.

    Returns:
        Standard A2UI v0.9.1 surface dictionary with messages array.
    """
    state = state or {}
    surface_id = "kitchen-sink-final-summary"
    root_id = "final-summary-root"

    defaults = get_default_form_values()
    submission = state.get("kitchen_sink_submission") or defaults
    budget_usd = float(submission.get("computeBudgetUsd", defaults["computeBudgetUsd"]))

    # Section 1: Stepper (Step 4 completed)
    stepper = Stepper(
        component_id="summary-stepper",
        steps=[
            {"id": "step-1", "title": "Identity & Selectors", "status": "completed"},
            {"id": "step-2", "title": "Sliders & Schedule", "status": "completed"},
            {"id": "step-3", "title": "Resource Allocation", "status": "completed"},
            {"id": "step-4", "title": "Committed in session.state", "status": "completed"},
        ],
        active_step=4,
    )

    header_card = MaterialCard(
        component_id="summary-header-card",
        title="Final Form Submission & session.state Inspector",
        subtitle="A2UI v0.9.1 Reactive State Mutation Verification",
        children=["summary-header-col"],
    )

    summary_header_col = MaterialColumn(
        component_id="summary-header-col",
        children=["summary-stepper", "summary-badge-row", "summary-header-desc"],
        spacing=8,
    )

    badge_status = MaterialBadge(
        component_id="badge-summary-status",
        text="PERSISTED IN SESSION.STATE",
        color="success",
    )
    badge_turns = MaterialBadge(
        component_id="badge-summary-turns",
        text=f"COMMITS: {len(state.get('submission_history', [1]))}",
        color="primary",
    )
    summary_badge_row = MaterialRow(
        component_id="summary-badge-row",
        children=["badge-summary-status", "badge-summary-turns"],
        spacing=8,
    )

    summary_header_desc = MaterialText(
        component_id="summary-header-desc",
        text=(
            "The A2UI Form Wizard successfully dispatched the resolved UserAction payload. "
            "All values were intercepted by A2uiAdaptor, committed into session.state['kitchen_sink_submission'], "
            "and emitted via state_delta for multi-turn conversational persistence."
        ),
        variant="body2",
    )

    # Section 2: Comparison Table (Field, Pointer, Default, Submitted, Status)
    field_metadata = [
        ("agentName", "Agent System Name", "/form/agentName"),
        ("ownerEmail", "Architect Email", "/form/ownerEmail"),
        ("environment", "Deployment Environment", "/form/environment"),
        ("reasoningTier", "Reasoning & Thinking Tier", "/form/reasoningTier"),
        ("capabilities", "Active Capabilities", "/form/capabilities"),
        ("computeBudgetUsd", "Monthly Compute Budget ($ USD)", "/form/computeBudgetUsd"),
        ("confidenceThreshold", "Confidence Threshold (%)", "/form/confidenceThreshold"),
        ("enableModelArmor", "Model Armor Active", "/form/enableModelArmor"),
        ("requireHitlApproval", "Require HITL Approval", "/form/requireHitlApproval"),
        ("launchDate", "Go-Live Launch Date", "/form/launchDate"),
        ("maintenanceWindow", "Daily Maintenance (UTC)", "/form/maintenanceWindow"),
        ("notes", "Configuration Notes", "/form/notes"),
    ]

    table_rows: List[Dict[str, Any]] = []
    for key, label, pointer in field_metadata:
        def_val = defaults.get(key)
        sub_val = submission.get(key, def_val)

        # Determine if changed
        is_changed = str(sub_val) != str(def_val)
        status_label = "CHANGED" if is_changed else "DEFAULT"

        def_str = ", ".join(def_val) if isinstance(def_val, list) else str(def_val)
        sub_str = ", ".join(sub_val) if isinstance(sub_val, list) else str(sub_val)

        table_rows.append(
            {
                "field": label,
                "pointer": pointer,
                "defaultValue": def_str,
                "submittedValue": sub_str,
                "status": status_label,
            }
        )

    rich_table = RichTable(
        component_id="table-comparison",
        title="Field-by-Field Committed Values vs. Defaults",
        columns=[
            {"id": "field", "label": "Field"},
            {"id": "pointer", "label": "JSON Pointer Path"},
            {"id": "defaultValue", "label": "Default Value"},
            {"id": "submittedValue", "label": "Submitted Value (in session.state)"},
            {"id": "status", "label": "Status"},
        ],
        rows=table_rows,
    )

    table_card = MaterialCard(
        component_id="card-summary-table",
        title="1. Form Submission Delta Verification Table",
        subtitle="Verifies two-way binding extraction and persistence",
        children=["table-comparison"],
    )

    # Section 3: VegaChart Budget Breakdown
    budget_data = compute_budget_breakdown(budget_usd)
    vega_spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "title": f"Monthly Budget Allocation Breakdown (${budget_usd:,.2f} USD Total)",
        "description": "Calculated dynamically from submitted computeBudgetUsd form field.",
        "width": "container",
        "height": 180,
        "data": {"values": budget_data},
        "mark": "bar",
        "encoding": {
            "x": {"field": "category", "type": "nominal", "axis": {"labelAngle": 0}},
            "y": {"field": "allocation", "type": "quantitative", "title": "Budget ($ USD)"},
            "color": {"value": "#10b981"},
        },
    }

    vega_chart = VegaChart(
        component_id="chart-budget-breakdown",
        spec=vega_spec,
        title=f"Dynamic Resource Allocation (${budget_usd:,.0f} USD)",
    )

    chart_card = MaterialCard(
        component_id="card-budget-chart",
        title="2. Submitted Resource Allocation Visualization",
        subtitle="Vega-Lite v5 chart computed directly from submitted computeBudgetUsd",
        children=["chart-budget-breakdown"],
    )

    # Section 4: Collapsible Raw session.state Memory Inspector
    formatted_state_json = json.dumps(
        {
            "kitchen_sink_submission": submission,
            "submission_history_count": len(state.get("submission_history", [])),
            "last_updated": state.get("last_updated", "now"),
        },
        indent=2,
    )

    raw_state_panel = MaterialExpansionPanel(
        component_id="panel-raw-state-inspector",
        title="3. Raw session.state['kitchen_sink_submission'] Memory Inspector",
        expanded=True,
        children=["text-raw-state-json"],
    )

    text_raw_state_json = MaterialText(
        component_id="text-raw-state-json",
        text=formatted_state_json,
        variant="code",
    )

    # Section 5: Action Buttons (Edit Form Again, Reset Session State, View Gallery)
    btn_edit_again = MaterialButton(
        component_id="btn-edit-wizard-again",
        label="Edit Form Again",
        variant="contained",
        color="primary",
        action={"name": "show_wizard", "context": {}},
    )

    btn_reset_state = MaterialButton(
        component_id="btn-reset-session-state",
        label="Reset Session State to Defaults",
        variant="outlined",
        color="secondary",
        action={"name": "reset_state", "context": {}},
    )

    btn_back_gallery = MaterialButton(
        component_id="btn-back-to-gallery",
        label="Return to Component Gallery",
        variant="outlined",
        action={"name": "show_gallery", "context": {}},
    )

    row_summary_actions = MaterialRow(
        component_id="row-summary-actions",
        children=["btn-edit-wizard-again", "btn-reset-session-state", "btn-back-to-gallery"],
        spacing=8,
    )

    action_card = MaterialCard(
        component_id="card-summary-actions",
        title="4. Next Actions",
        subtitle="Iterate on configuration or view complete component gallery",
        children=["row-summary-actions"],
    )

    # Assembly
    div_s1 = MaterialDivider(component_id="div-s1")
    div_s2 = MaterialDivider(component_id="div-s2")
    div_s3 = MaterialDivider(component_id="div-s3")

    summary_root = MaterialColumn(
        component_id=root_id,
        children=[
            "summary-header-card",
            "div-s1",
            "card-summary-table",
            "div-s2",
            "card-budget-chart",
            "div-s3",
            "panel-raw-state-inspector",
            "card-summary-actions",
        ],
        spacing=8,
    )

    all_components: List[A2UIComponent] = [
        summary_root,
        # Header
        header_card,
        summary_header_col,
        stepper,
        summary_badge_row,
        badge_status,
        badge_turns,
        summary_header_desc,
        # Table
        div_s1,
        table_card,
        rich_table,
        # Chart
        div_s2,
        chart_card,
        vega_chart,
        # Raw State Inspector
        div_s3,
        raw_state_panel,
        text_raw_state_json,
        # Actions
        action_card,
        row_summary_actions,
        btn_edit_again,
        btn_reset_state,
        btn_back_gallery,
    ]

    return build_a2ui_surface(
        surface_id=surface_id,
        root_id=root_id,
        components=all_components,
        data_model={"submission": submission},
        catalog_id=COMPOSITE_CATALOG_ID,
    )

# ============================================================================
# Consolidated from a2ui_adaptor.py
# ============================================================================
import datetime
import json
import re
from typing import Any, Dict, List, Optional, Union


class A2uiAdaptorResponse(str):
    """
    Hybrid response object that behaves simultaneously as:
    1. A formatted markdown string (`message + ```a2ui\\n{surface}\\n````) when passed to `Part.from_text(text=res)`
    2. A dictionary (`res["status"]`, `res["surface"]`, `res["state_delta"]`, `res.get(...)`) for tools and unit tests
    3. An awaitable (`await A2uiAdaptor.route_user_action(...)`) for async `before_model_callback` hooks
    4. A boolean (`if adaptor_response:`) that is `True` only when `status == "handled"` and `False` when `"unhandled"`.
    """

    def __new__(cls, data: Dict[str, Any]) -> "A2uiAdaptorResponse":
        handled = data.get("status") == "handled"
        if handled:
            msg = data.get("message") or "Here is the interactive A2UI surface:"
            surf = data.get("surface")
            text_val = f"{msg}\n\n```a2ui\n{json.dumps(surf)}\n```" if surf else msg
        else:
            text_val = ""
        obj = super().__new__(cls, text_val)
        obj._data = dict(data)
        return obj

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, (int, slice)):
            return super().__getitem__(key)
        return self._data[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self._data[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def __contains__(self, key: object) -> bool:
        return key in self._data or (isinstance(key, str) and super().__contains__(key))

    def keys(self):
        return self._data.keys()

    def items(self):
        return self._data.items()

    def values(self):
        return self._data.values()

    def to_dict(self) -> Dict[str, Any]:
        return dict(self._data)

    def __bool__(self) -> bool:
        return self._data.get("status") == "handled"

    def __await__(self):
        async def _coro():
            return self
        return _coro().__await__()


def _ensure_mutable_state(session_state: Optional[Any]) -> Dict[str, Any]:
    """Extracts or wraps ADK State / dict objects so mutations persist cleanly."""
    if session_state is None:
        return {}
    if isinstance(session_state, dict):
        return session_state
    # ADK CallbackContext.state / ToolContext.state supports __getitem__ and __setitem__
    return session_state


class A2uiAdaptor:
    """
    Central A2UI Adaptor and MVC Action Router for the Kitchen Sink sample.

    Intercepts user-driven interactive actions and consumer prompts, routing them
    to deterministic handlers to generate reactive A2UI surfaces and apply
    state_delta mutations without expensive LLM calls.
    """

    @classmethod
    def handle_help(cls, context: Optional[Dict[str, Any]] = None) -> A2uiAdaptorResponse:
        """Renders the standard Kitchen Sink documentation & help card surface."""
        root_id = "help-surface-root"
        components: List[A2UIComponent] = [
            MaterialColumn(component_id=root_id, children=["help-card"], spacing=0),
            MaterialCard(
                component_id="help-card",
                title="A2UI v0.9.1 Kitchen Sink Documentation & Guide",
                subtitle="Component Gallery, Form Wizard & session.state Architecture",
                children=["help-column"],
            ),
            MaterialColumn(
                component_id="help-column",
                children=["help-text-1", "help-text-2", "help-text-3"],
                spacing=8,
            ),
            MaterialText(
                component_id="help-text-1",
                text="1. All-in-One Component Gallery: Demonstrates every Material 3 and Gemini Enterprise Composite widget.",
                variant="body2",
            ),
            MaterialText(
                component_id="help-text-2",
                text="2. Multi-Step Form Wizard: Interactive 3-step configuration with two-way data model bindings under /form/...",
                variant="body2",
            ),
            MaterialText(
                component_id="help-text-3",
                text="3. State Persistence & Delta: Submitting the form commits values to session.state['kitchen_sink_submission'] and updates the final summary.",
                variant="body2",
            ),
        ]
        surface = build_a2ui_surface(surface_id="help-surface", root_id=root_id, components=components)
        return A2uiAdaptorResponse({
            "status": "handled",
            "surface": surface,
            "state_delta": {},
            "message": "**A2UI v0.9.1 Kitchen Sink Documentation & Guide** — Explore the interactive Component Gallery, 3-Step Configuration Form Wizard, and Session State Summary below:",
        })

    @classmethod
    def handle_about(cls, context: Optional[Dict[str, Any]] = None) -> A2uiAdaptorResponse:
        """Renders the About dialog surface."""
        root_id = "about-surface-root"
        components: List[A2UIComponent] = [
            MaterialColumn(component_id=root_id, children=["about-card"], spacing=0),
            MaterialCard(
                component_id="about-card",
                title="About A2UI v0.9.1 Kitchen Sink Showcase",
                subtitle="Visual AI Agent Designer Sample Gallery",
                children=["about-column"],
            ),
            MaterialColumn(
                component_id="about-column",
                children=["about-text-1", "about-text-2"],
                spacing=8,
            ),
            MaterialText(
                component_id="about-text-1",
                text="A2UI (Agent-to-User Interface) enables declarative UI generation from AI Agents.",
                variant="body2",
            ),
            MaterialText(
                component_id="about-text-2",
                text="Specification v0.9.1 / gemini_enterprise_composite_v09 / Model: gemini-3.8-flash on Vertex AI global.",
                variant="body2",
            ),
        ]
        surface = build_a2ui_surface(surface_id="about-surface", root_id=root_id, components=components)
        return A2uiAdaptorResponse({
            "status": "handled",
            "surface": surface,
            "state_delta": {},
            "message": "**A2UI v0.9.1 Kitchen Sink & Form State Showcase** (v1.2.0) — Powered by `gemini_enterprise_composite_v09` and `material_v09` catalogs:",
        })

    @classmethod
    def handle_show_gallery(
        cls,
        context: Optional[Dict[str, Any]] = None,
        session_state: Optional[Any] = None,
    ) -> A2uiAdaptorResponse:
        """Renders the All-in-One Component Gallery surface or a focused component section."""
        state_obj = _ensure_mutable_state(session_state)
        state_dict = {"kitchen_sink_submission": state_obj.get("kitchen_sink_submission")} if hasattr(state_obj, "get") else {}
        section = context.get("section") if isinstance(context, dict) else None
        surface = build_widget_gallery_surface(state_dict, section=section)
        if hasattr(state_obj, "__setitem__"):
            try:
                state_obj["last_viewed_surface"] = "kitchen-sink-gallery"
            except Exception:
                pass

        section_messages = {
            "map": "Here is the interactive **A2UI Geographic Map (`GoogleMap`)** component with multi-region deployment pins, route arcs, and zoom controls:",
            "charts": "Here are the interactive **A2UI Vega-Lite v5 Charts (`VegaChart`)** showcasing both Bar and Arc/Donut visualizations:",
            "badges": "Here are the interactive **A2UI Badges, Icons & Progress Feedback** components (`MaterialBadge`, `MaterialIcon`, `MaterialProgressBar`, and `MaterialProgressSpinner`):",
            "carousel": "Here is the interactive **A2UI Mosaic Carousel (`MosaicCarousel` & `MosaicSlideCard`)** with visual hero imagery, badges, pagination controls, and action triggers:",
            "layout": "Here are the interactive **A2UI Layout & Structural Containers** (`Stepper`, `MaterialTabs`, `MaterialExpansionPanel`, `MaterialCard`, `MaterialRow`, and `MaterialColumn`):",
            "tables": "Here are the interactive **A2UI Data Tables & Work Order List** (`RichTable` and `WorkOrderList`) components:",
            "forms": "Here are the interactive **A2UI Two-Way Bound Form Controls** (`MaterialInput`, `MaterialSelect`, `MaterialRadioButton`, `MaterialCheckbox`, `MaterialSlideToggle`, `MaterialChips`, `MaterialSlider`, `MaterialDatepicker`, and `MaterialTimepicker`):",
        }
        message = section_messages.get(
            str(section or "").lower(),
            "Here is the interactive **A2UI v0.9.1 Component Gallery**. You can interact with the tabs, inputs, toggles, tables, charts, map pins, carousel cards, and action buttons directly below:",
        )
        return A2uiAdaptorResponse({
            "status": "handled",
            "surface": surface,
            "state_delta": {"last_viewed_surface": "kitchen-sink-gallery"},
            "message": message,
        })

    @classmethod
    def handle_show_wizard(
        cls,
        context: Optional[Dict[str, Any]] = None,
        session_state: Optional[Any] = None,
    ) -> A2uiAdaptorResponse:
        """Renders the interactive 3-step configuration form wizard."""
        state_obj = _ensure_mutable_state(session_state)
        state_dict = {"kitchen_sink_submission": state_obj.get("kitchen_sink_submission")} if hasattr(state_obj, "get") else {}
        step = int(context.get("step", 1)) if isinstance(context, dict) else 1
        surface = build_form_wizard_surface(state_dict, active_step=step)
        if hasattr(state_obj, "__setitem__"):
            try:
                state_obj["last_viewed_surface"] = "kitchen-sink-form-wizard"
            except Exception:
                pass
        return A2uiAdaptorResponse({
            "status": "handled",
            "surface": surface,
            "state_delta": {"last_viewed_surface": "kitchen-sink-form-wizard"},
            "message": f"Here is the interactive **3-Step Agent Configuration Wizard** (Step {step}). Edit any field below and click **Submit & Persist to session.state** when ready:",
        })

    @classmethod
    def handle_show_summary(
        cls,
        context: Optional[Dict[str, Any]] = None,
        session_state: Optional[Any] = None,
    ) -> A2uiAdaptorResponse:
        """Renders the final summary and state inspector surface."""
        state_obj = _ensure_mutable_state(session_state)
        defaults = get_default_form_values()
        sub = (state_obj.get("kitchen_sink_submission") if hasattr(state_obj, "get") else None) or defaults
        history = (state_obj.get("submission_history") if hasattr(state_obj, "get") else None) or []
        state_dict = {
            "kitchen_sink_submission": sub,
            "submission_history": history,
        }
        surface = build_final_summary_surface(state_dict)
        return A2uiAdaptorResponse({
            "status": "handled",
            "surface": surface,
            "state_delta": {"last_viewed_surface": "kitchen-sink-final-summary"},
            "message": (
                f"Here is the live **Committed Configuration & Session State Summary** for "
                f"**{sub.get('agentName', 'enterprise-copilot-v1')}** "
                f"(Committed Compute Budget: **${float(sub.get('computeBudgetUsd', 2500)):,.0f}**):"
            ),
        })

    @classmethod
    def handle_reset_state(
        cls,
        context: Optional[Dict[str, Any]] = None,
        session_state: Optional[Any] = None,
    ) -> A2uiAdaptorResponse:
        """Resets the committed form values back to initial defaults."""
        defaults = get_default_form_values()
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        state_delta = {
            "kitchen_sink_submission": defaults,
            "submission_history": [],
            "last_updated": now_iso,
        }
        if session_state is not None and hasattr(session_state, "__setitem__"):
            try:
                session_state["kitchen_sink_submission"] = defaults
                session_state["submission_history"] = []
                session_state["last_updated"] = now_iso
            except Exception:
                pass

        surface = build_form_wizard_surface({"kitchen_sink_submission": defaults, "submission_history": []}, active_step=1)
        return A2uiAdaptorResponse({
            "status": "handled",
            "surface": surface,
            "state_delta": state_delta,
            "message": (
                f"Session configuration state has been reset to defaults "
                f"(**{defaults['agentName']}**, compute budget **${defaults['computeBudgetUsd']:,.0f}**)."
            ),
        })

    @classmethod
    def handle_submit_kitchen_sink_form(
        cls,
        context: Optional[Dict[str, Any]] = None,
        session_state: Optional[Any] = None,
    ) -> A2uiAdaptorResponse:
        """
        Processes form submission from the Form Wizard.

        Resolves user-submitted context values, validates and persists into session.state,
        appends to submission_history, computes state_delta, and renders the final summary surface.
        """
        context = context if isinstance(context, dict) else {}
        state_obj = _ensure_mutable_state(session_state)

        defaults = get_default_form_values()
        existing = (state_obj.get("kitchen_sink_submission") if hasattr(state_obj, "get") else None) or defaults
        updated_submission = dict(existing)

        for key, val in context.items():
            if val is not None:
                if key == "computeBudgetUsd":
                    try:
                        updated_submission[key] = float(val)
                    except (ValueError, TypeError):
                        updated_submission[key] = defaults["computeBudgetUsd"]
                elif key == "confidenceThreshold":
                    try:
                        updated_submission[key] = float(val)
                    except (ValueError, TypeError):
                        updated_submission[key] = defaults["confidenceThreshold"]
                elif key in ("enableModelArmor", "requireHitlApproval"):
                    if isinstance(val, str):
                        updated_submission[key] = val.lower() in ("true", "1", "yes")
                    else:
                        updated_submission[key] = bool(val)
                elif key == "capabilities":
                    if isinstance(val, list):
                        updated_submission[key] = val
                    elif isinstance(val, str):
                        updated_submission[key] = [c.strip() for c in val.split(",") if c.strip()]
                    else:
                        updated_submission[key] = defaults["capabilities"]
                else:
                    updated_submission[key] = val

        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        existing_history = (state_obj.get("submission_history") if hasattr(state_obj, "get") else None) or []
        history = list(existing_history)
        history.append({
            "timestamp": timestamp,
            "submission": updated_submission,
        })

        if session_state is not None and hasattr(session_state, "__setitem__"):
            try:
                session_state["kitchen_sink_submission"] = updated_submission
                session_state["submission_history"] = history
                session_state["last_updated"] = timestamp
            except Exception:
                pass

        state_delta = {
            "kitchen_sink_submission": updated_submission,
            "submission_history": history,
            "last_updated": timestamp,
        }

        surface = build_final_summary_surface({
            "kitchen_sink_submission": updated_submission,
            "submission_history": history,
            "last_updated": timestamp,
        })

        return A2uiAdaptorResponse({
            "status": "handled",
            "surface": surface,
            "state_delta": state_delta,
            "message": (
                f"Successfully persisted configuration for **{updated_submission.get('agentName')}** "
                f"with a **${float(updated_submission.get('computeBudgetUsd', 2500)):,.0f}** monthly compute budget into `session.state`!"
            ),
        })

    @classmethod
    def handle_save_step_draft(
        cls,
        context: Optional[Dict[str, Any]] = None,
        session_state: Optional[Any] = None,
    ) -> A2uiAdaptorResponse:
        """Saves interim draft values into session.state without finalizing."""
        context = context if isinstance(context, dict) else {}
        state_obj = _ensure_mutable_state(session_state)
        defaults = get_default_form_values()
        existing = (state_obj.get("kitchen_sink_submission") if hasattr(state_obj, "get") else None) or defaults
        draft_submission = {**existing, **context}

        if session_state is not None and hasattr(session_state, "__setitem__"):
            try:
                session_state["kitchen_sink_submission"] = draft_submission
            except Exception:
                pass

        step = int(context.get("step", 2)) if isinstance(context, dict) else 2
        surface = build_form_wizard_surface({"kitchen_sink_submission": draft_submission}, active_step=step)

        return A2uiAdaptorResponse({
            "status": "handled",
            "surface": surface,
            "state_delta": {"kitchen_sink_submission": draft_submission},
            "message": "Interim configuration draft saved to `session.state`.",
        })

    @classmethod
    def handle_user_action(
        cls,
        action_name: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        session_state: Optional[Any] = None,
        **kwargs: Any,
    ) -> A2uiAdaptorResponse:
        """
        Main dispatch entry point for A2UI UserAction events.
        """
        if action_name is None:
            for key in ("user_action", "action_or_prompt", "action", "prompt", "user_prompt", "payload", "query", "text", "message"):
                if key in kwargs and kwargs[key] is not None:
                    action_name = kwargs[key]
                    break
        if session_state is None:
            session_state = kwargs.get("state") or getattr(kwargs.get("callback_context"), "state", None)
        if context is None:
            context = kwargs.get("ctx") or kwargs.get("action_context") or kwargs.get("params")

        handlers = {
            "help": lambda: cls.handle_help(context),
            "about": lambda: cls.handle_about(context),
            "show_gallery": lambda: cls.handle_show_gallery(context, session_state),
            "show_map": lambda: cls.handle_show_gallery({"section": "map"}, session_state),
            "show_charts": lambda: cls.handle_show_gallery({"section": "charts"}, session_state),
            "show_badges": lambda: cls.handle_show_gallery({"section": "badges"}, session_state),
            "show_carousel": lambda: cls.handle_show_gallery({"section": "carousel"}, session_state),
            "show_layout": lambda: cls.handle_show_gallery({"section": "layout"}, session_state),
            "show_tables": lambda: cls.handle_show_gallery({"section": "tables"}, session_state),
            "show_forms": lambda: cls.handle_show_gallery({"section": "forms"}, session_state),
            "show_wizard": lambda: cls.handle_show_wizard(context, session_state),
            "show_summary": lambda: cls.handle_show_summary(context, session_state),
            "reset_state": lambda: cls.handle_reset_state(context, session_state),
            "submit_kitchen_sink_form": lambda: cls.handle_submit_kitchen_sink_form(context, session_state),
            "save_step_draft": lambda: cls.handle_save_step_draft(context, session_state),
            "show_merchandising_info": lambda: cls.handle_show_wizard(context, session_state),
            "show_kc_info": lambda: cls.handle_show_summary(context, session_state),
        }

        handler = handlers.get(str(action_name or ""))
        if handler:
            return handler()

        return A2uiAdaptorResponse({
            "status": "unhandled",
            "message": f"Action '{action_name}' is not handled deterministically by A2uiAdaptor.",
            "state_delta": {},
        })

    @classmethod
    def route_user_action(
        cls,
        user_action: Union[Dict[str, Any], str, None] = None,
        session_state: Optional[Any] = None,
        context: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> A2uiAdaptorResponse:
        """
        Routes either a structured A2UI userAction dict, a JSON string, or a natural-language
        consumer prompt to the corresponding interactive A2UI v0.9.1 surface handler.
        """
        if user_action is None:
            for key in ("action_name", "action_or_prompt", "action", "prompt", "user_prompt", "payload", "query", "text", "message", "input_text", "raw_action"):
                if key in kwargs and kwargs[key] is not None:
                    user_action = kwargs[key]
                    break
        if session_state is None:
            session_state = kwargs.get("state") or getattr(kwargs.get("callback_context"), "state", None)
        if context is None:
            context = kwargs.get("ctx") or kwargs.get("action_context") or kwargs.get("params")
        if isinstance(user_action, dict):
            inner = (
                user_action.get("userAction")
                if isinstance(user_action.get("userAction"), dict)
                else user_action
            )
            action_name = inner.get("name") or inner.get("actionName") or ""
            resolved_ctx = inner.get("context") if isinstance(inner.get("context"), dict) else inner
            return cls.handle_user_action(
                action_name=action_name,
                context=resolved_ctx,
                session_state=session_state,
            )

        if not isinstance(user_action, str) or not user_action.strip():
            return A2uiAdaptorResponse({"status": "unhandled", "state_delta": {}})

        raw = user_action.strip()

        # 1. Try parsing JSON string (e.g. '{"userAction": {"name": "show_gallery", ...}}')
        if raw.startswith("{") and ("userAction" in raw or "action" in raw or "name" in raw):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    return cls.route_user_action(parsed, session_state=session_state)
            except Exception:
                pass

        # 2. Direct action name match
        norm = raw.lower().strip()
        if norm in (
            "help",
            "about",
            "show_gallery",
            "show_map",
            "show_charts",
            "show_badges",
            "show_carousel",
            "show_layout",
            "show_tables",
            "show_forms",
            "show_wizard",
            "show_summary",
            "reset_state",
            "submit_kitchen_sink_form",
            "save_step_draft",
        ):
            return cls.handle_user_action(action_name=norm, context=context, session_state=session_state)

        # 3. Natural-language consumer prompt routing
        if norm in ("/help", "show help"):
            return cls.handle_help(context)
        if norm in ("/about", "show about"):
            return cls.handle_about(context)

        if "reset" in norm and ("default" in norm or "state" in norm or "configuration" in norm):
            return cls.handle_reset_state(context, session_state=session_state)

        if "submit" in norm or "persist" in norm:
            budget_match = re.search(r"(?:budget\s+(?:of\s+)?\$?|usd\s*)(\d+(?:\.\d+)?)", norm)
            submit_ctx: Dict[str, Any] = dict(context or {})
            if budget_match:
                submit_ctx["computeBudgetUsd"] = float(budget_match.group(1))
            return cls.handle_submit_kitchen_sink_form(submit_ctx, session_state=session_state)

        if any(
            kw in norm
            for kw in (
                "wizard",
                "configure",
                "configuration form",
                "step 1",
                "step 2",
                "step 3",
                "sliders",
                "guardrail",
            )
        ):
            step = 1
            if "step 2" in norm or "slider" in norm or "guardrail" in norm:
                step = 2
            elif "step 3" in norm or "budget" in norm:
                step = 3
            return cls.handle_show_wizard({"step": step}, session_state=session_state)

        if any(
            kw in norm
            for kw in (
                "session.state",
                "committed",
                "persisted",
                "allocation chart",
                "memory inspector",
                "summary",
                "current budget",
                "kitchen_sink_submission",
            )
        ):
            return cls.handle_show_summary(context, session_state=session_state)

        if any(kw in norm for kw in ("gallery", "all-in-one", "all components", "every component")):
            return cls.handle_show_gallery(context, session_state=session_state)

        # Focused component showcase requests (Map, Vega-Lite Charts, Badges & Feedback, Mosaic Carousel, Layout, Tables, Forms)
        if any(kw in norm for kw in ("carousel", "mosaic", "slide card", "slides")):
            return cls.handle_show_gallery({"section": "carousel"}, session_state=session_state)

        if any(kw in norm for kw in ("map", "googlemap", "google_map", "geographic", "markers")):
            return cls.handle_show_gallery({"section": "map"}, session_state=session_state)

        if any(kw in norm for kw in ("vega", "vega-lite", "vegalite", "chart", "charts", "donut", "pie", "bar chart", "line chart")):
            return cls.handle_show_gallery({"section": "charts"}, session_state=session_state)

        if any(kw in norm for kw in ("badge", "badges", "feedback", "progress", "spinner", "icon", "icons")):
            return cls.handle_show_gallery({"section": "badges"}, session_state=session_state)

        if any(kw in norm for kw in ("layout", "container", "containers", "tabs", "accordion", "expansion", "divider", "stepper")):
            return cls.handle_show_gallery({"section": "layout"}, session_state=session_state)

        if any(kw in norm for kw in ("table", "tables", "work order", "work orders", "richtable")):
            return cls.handle_show_gallery({"section": "tables"}, session_state=session_state)

        if any(kw in norm for kw in ("form control", "form controls", "textfield", "textfields", "checkbox", "checkboxes", "datepicker", "timepicker")):
            return cls.handle_show_gallery({"section": "forms"}, session_state=session_state)

        if any(kw in norm for kw in ("component", "widgets", "kitchen sink", "showcase", "catalog")):
            return cls.handle_show_gallery(context, session_state=session_state)

        return A2uiAdaptorResponse({"status": "unhandled", "state_delta": {}})

# ============================================================================
# Tool Functions (kitchen_sink_tools.py)
# ============================================================================
import copy
import datetime
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

DATA_FIXTURE_PATH = Path(__file__).resolve().parent.parent / "data" / "initial_session_state.json"

DEFAULT_SUBMISSION: Dict[str, Any] = get_default_form_values()
DEFAULT_CONFIG: Dict[str, Any] = DEFAULT_SUBMISSION
calculate_budget_breakdown = compute_budget_breakdown


def _load_initial_fixture() -> Dict[str, Any]:
    """Loads default session state from data/initial_session_state.json if available."""
    if DATA_FIXTURE_PATH.exists():
        try:
            with open(DATA_FIXTURE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "kitchen_sink_submission": copy.deepcopy(DEFAULT_SUBMISSION),
        "submission_history": [],
    }


_ACTIVE_SESSION_STATE: Dict[str, Any] = _load_initial_fixture()


def _resolve_state_dict(
    session_state: Optional[Dict[str, Any]] = None,
    tool_context: Optional[Any] = None,
) -> Any:
    """Resolves the active state dictionary from explicit session_state, ADK tool_context, or module memory."""
    if isinstance(session_state, dict):
        return session_state
    if tool_context is not None and hasattr(tool_context, "state") and tool_context.state is not None:
        st = tool_context.state
        try:
            if "kitchen_sink_submission" not in st:
                initial = _load_initial_fixture()
                st["kitchen_sink_submission"] = copy.deepcopy(
                    _ACTIVE_SESSION_STATE.get("kitchen_sink_submission") or initial["kitchen_sink_submission"]
                )
                st["submission_history"] = copy.deepcopy(
                    _ACTIVE_SESSION_STATE.get("submission_history") or initial.get("submission_history", [])
                )
            return st
        except Exception:
            pass
    return _ACTIVE_SESSION_STATE


def get_current_form_state(
    session_state: Optional[Dict[str, Any]] = None,
    tool_context: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Returns the current `kitchen_sink_submission` and `submission_history` from `session.state`.

    Args:
        session_state: Optional session state dictionary.
        tool_context: Optional ADK ToolContext injected by the runner.

    Returns:
        Dictionary containing current configuration, submission history, and budget breakdown.
    """
    state = _resolve_state_dict(session_state=session_state, tool_context=tool_context)
    submission = state.get("kitchen_sink_submission") or copy.deepcopy(DEFAULT_SUBMISSION)
    history = state.get("submission_history", [])
    budget_usd = float(submission.get("computeBudgetUsd", 2500))

    return {
        "status": "success",
        "configuration": submission,
        "submission": submission,
        "submissionCount": len(history),
        "history": history,
        "budgetBreakdown": compute_budget_breakdown(budget_usd),
        "surface": build_final_summary_surface(state),
    }


def submit_and_persist_form(
    form_payload: Optional[Dict[str, Any]] = None,
    session_state: Optional[Dict[str, Any]] = None,
    agent_name: Optional[str] = None,
    compute_budget_usd: Optional[float] = None,
    owner_email: Optional[str] = None,
    environment: Optional[str] = None,
    reasoning_tier: Optional[str] = None,
    capabilities: Optional[List[str]] = None,
    confidence_threshold: Optional[float] = None,
    enable_model_armor: Optional[bool] = None,
    require_hitl_approval: Optional[bool] = None,
    launch_date: Optional[str] = None,
    maintenance_window: Optional[str] = None,
    release_notes: Optional[str] = None,
    tool_context: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Validates and persists submitted form values into `session.state["kitchen_sink_submission"]`.

    Computes budget breakdown metrics and returns the updated state plus the
    A2UI final summary surface envelope.

    Args:
        form_payload: Optional dictionary containing user-submitted form fields.
        session_state: Optional session state dictionary.
        agent_name: Optional override for agentName.
        compute_budget_usd: Optional override for computeBudgetUsd.
        owner_email: Optional override for ownerEmail.
        environment: Optional override for environment.
        reasoning_tier: Optional override for reasoningTier.
        capabilities: Optional override for capabilities list.
        confidence_threshold: Optional override for confidenceThreshold.
        enable_model_armor: Optional override for enableModelArmor.
        require_hitl_approval: Optional override for requireHitlApproval.
        launch_date: Optional override for launchDate.
        maintenance_window: Optional override for maintenanceWindow.
        release_notes: Optional override for notes / releaseNotes.
        tool_context: Optional ADK ToolContext injected by the runner.

    Returns:
        Dictionary containing updated state, state_delta, and rendered A2UI surface.
    """
    merged_payload: Dict[str, Any] = dict(form_payload or {})
    kw_mapping = {
        "agentName": agent_name,
        "computeBudgetUsd": compute_budget_usd,
        "ownerEmail": owner_email,
        "environment": environment,
        "reasoningTier": reasoning_tier,
        "capabilities": capabilities,
        "confidenceThreshold": confidence_threshold,
        "enableModelArmor": enable_model_armor,
        "requireHitlApproval": require_hitl_approval,
        "launchDate": launch_date,
        "maintenanceWindow": maintenance_window,
        "notes": release_notes,
    }
    for k, v in kw_mapping.items():
        if v is not None:
            merged_payload[k] = v

    state = _resolve_state_dict(session_state=session_state, tool_context=tool_context)
    result = dict(
        A2uiAdaptor.handle_submit_kitchen_sink_form(
            context=merged_payload,
            session_state=state,
        )
    )
    updated_sub = result.get("state_delta", {}).get("kitchen_sink_submission") or state.get("kitchen_sink_submission")
    result["submission"] = updated_sub
    result["configuration"] = updated_sub
    # Mirror into module-level active session state so sub-agents and subsequent turns stay synced
    if state is not _ACTIVE_SESSION_STATE:
        _ACTIVE_SESSION_STATE["kitchen_sink_submission"] = copy.deepcopy(updated_sub)
        _ACTIVE_SESSION_STATE["submission_history"] = copy.deepcopy(state.get("submission_history", []))
        _ACTIVE_SESSION_STATE["last_updated"] = state.get("last_updated")
    return result


def render_kitchen_sink_surface(
    mode: str = "gallery",
    step: int = 1,
    session_state: Optional[Dict[str, Any]] = None,
    tool_context: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Returns the requested A2UI v0.9.1 surface ("gallery", "wizard", "summary",
    or a focused widget section such as "map", "charts", "badges", "carousel",
    "layout", "tables", or "forms").

    Args:
        mode: Surface mode name ('gallery', 'wizard', 'summary', 'map', 'charts',
            'badges', 'carousel', 'layout', 'tables', 'forms').
        step: Active wizard step (1-3) when mode is 'wizard'.
        session_state: Optional session state dictionary.
        tool_context: Optional ADK ToolContext injected by the runner.

    Returns:
        A2UI surface dictionary with messages array.
    """
    state = _resolve_state_dict(session_state=session_state, tool_context=tool_context)
    norm_mode = (mode or "gallery").strip().lower()

    if norm_mode in ("wizard", "form", "form_wizard", "kitchen-sink-form-wizard"):
        return build_form_wizard_surface(state, active_step=step)
    elif norm_mode in ("summary", "final_summary", "inspector", "kitchen-sink-final-summary"):
        return build_final_summary_surface(state)
    elif norm_mode in (
        "map",
        "google_map",
        "googlemap",
        "geo",
        "chart",
        "charts",
        "vega",
        "vegalite",
        "vega-lite",
        "badge",
        "badges",
        "feedback",
        "progress",
        "spinner",
        "icons",
        "carousel",
        "mosaic",
        "mosaic_carousel",
        "slides",
        "layout",
        "containers",
        "tabs",
        "accordion",
        "expansion",
        "stepper",
        "table",
        "tables",
        "work_orders",
        "workorders",
        "richtable",
        "forms",
        "inputs",
        "controls",
    ):
        return build_widget_gallery_surface(state, section=norm_mode)
    else:
        return build_widget_gallery_surface(state)


def reset_form_state(
    callback_context: Optional[Any] = None,
    tool_context: Optional[Any] = None,
    session_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Resets `session.state["kitchen_sink_submission"]` back to initial default values.
    """
    ctx = tool_context or callback_context
    state = _resolve_state_dict(session_state=session_state, tool_context=ctx)
    res = A2uiAdaptor.handle_reset_state(session_state=state)
    defaults = copy.deepcopy(DEFAULT_SUBMISSION)
    _ACTIVE_SESSION_STATE["kitchen_sink_submission"] = copy.deepcopy(defaults)
    _ACTIVE_SESSION_STATE["submission_history"] = []
    return {
        **defaults,
        "status": "reset",
        "surface": res.get("surface"),
        "state_delta": res.get("state_delta", {}),
    }


def get_help_documentation() -> Dict[str, Any]:
    """Returns structured help documentation and an A2UI help surface."""
    res = A2uiAdaptor.handle_help()
    return {
        "title": "A2UI v0.9.1 Kitchen Sink Documentation & Guide",
        "content": (
            "1. All-in-One Component Gallery ('kitchen-sink-gallery'): Demonstrates Material 3 and Gemini Enterprise Composite widgets.\n"
            "2. 3-Step Configuration Form Wizard ('kitchen-sink-form-wizard'): Two-way data bindings under /form/...\n"
            "3. Final Summary & State Inspector ('kitchen-sink-final-summary'): Inspects session.state['kitchen_sink_submission'] and renders budget breakdown."
        ),
        "available_surfaces": [
            "kitchen-sink-gallery",
            "kitchen-sink-form-wizard",
            "kitchen-sink-final-summary",
        ],
        "surface": res.get("surface"),
    }


def get_about_metadata() -> Dict[str, Any]:
    """Returns metadata about the A2UI v0.9.1 Kitchen Sink sample."""
    res = A2uiAdaptor.handle_about()
    return {
        "name": "A2UI v0.9.1 Kitchen Sink & Form State Showcase",
        "version": "1.2.0",
        "catalog": "gemini_enterprise_composite_v09",
        "specification": "A2UI v0.9.1",
        "status": "Ready",
        "surface": res.get("surface"),
    }

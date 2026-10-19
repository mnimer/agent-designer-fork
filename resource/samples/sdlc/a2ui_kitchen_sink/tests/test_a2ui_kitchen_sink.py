"""
Unit Tests for A2UI v0.9.1 Kitchen Sink Sample (TASK-241).

Validates:
1. All widget builders in a2ui_component.py.
2. build_widget_gallery_surface structure and components.
3. build_form_wizard_surface: verifying all 12 two-way bound /form/... JSON pointer paths and button context.
4. A2uiAdaptor.handle_user_action for submit_kitchen_sink_form: verifying user overrides persist into
   session_state["kitchen_sink_submission"], emit state_delta, and return kitchen-sink-final-summary.
5. Querying persisted values on subsequent turn via get_current_form_state.
6. A2uiKitchenSinkAgent blueprint validation: gemini-3.8-flash, 8pt grid coordinates, a2uiConfig enabled.

Author: Mike Nimer <mikenimer@google.com>
"""

import json
import os
import sys
import unittest
from pathlib import Path

# Add sample root directory to sys.path so packages are importable
SAMPLE_ROOT = Path(__file__).resolve().parent.parent
if str(SAMPLE_ROOT) not in sys.path:
    sys.path.insert(0, str(SAMPLE_ROOT))

from tools.kitchen_sink_tools import A2uiAdaptor
from tools.kitchen_sink_tools import (
    COMPOSITE_CATALOG_ID,
    MATERIAL_CATALOG_ID,
    A2UIComponent,
    A2uiSurfaceBuilder,
    GoogleMap,
    InteractiveChart,
    MaterialBadge,
    MaterialButton,
    MaterialButtonToggle,
    MaterialCard,
    MaterialCheckbox,
    MaterialChips,
    MaterialColumn,
    MaterialDatepicker,
    MaterialDialog,
    MaterialDivider,
    MaterialExpansionPanel,
    MaterialGridList,
    MaterialIcon,
    MaterialImage,
    MaterialInput,
    MaterialProgressBar,
    MaterialProgressSpinner,
    MaterialRadioButton,
    MaterialRow,
    MaterialSelect,
    MaterialSlideToggle,
    MaterialSlider,
    MaterialTable,
    MaterialTabs,
    MaterialText,
    MaterialTimepicker,
    MosaicCarousel,
    MosaicSlideCard,
    RichTable,
    RightPanelForm,
    Stepper,
    VegaChart,
    WorkOrderList,
    build_a2ui_surface,
    create_a2ui_part,
)
from tools.kitchen_sink_tools import (
    build_final_summary_surface,
    compute_budget_breakdown,
)
from tools.kitchen_sink_tools import (
    build_form_wizard_surface,
    get_default_form_values,
)
from tools.kitchen_sink_tools import (
    build_widget_gallery_surface,
)
from tools.kitchen_sink_tools import (
    get_current_form_state,
    render_kitchen_sink_surface,
    submit_and_persist_form,
)


class TestA2UIKitchenSinkComponents(unittest.TestCase):
    """Validates typed Python A2UI builder components and message serialization."""

    def test_base_component_serialization(self):
        """Verifies base component serialization to dictionary."""
        comp = A2UIComponent(
            component_id="comp-1",
            component="Card",
            properties={"elevation": 2},
            children=["comp-2"],
        )
        data = comp.to_dict()
        self.assertEqual(data["id"], "comp-1")
        self.assertEqual(data["component"], "Card")
        self.assertEqual(data["properties"]["elevation"], 2)
        self.assertEqual(data["children"], ["comp-2"])

    def test_all_material_builders(self):
        """Verifies all Material 3 and Composite component builder signatures."""
        c_card = MaterialCard("c1", title="Title", subtitle="Sub", children=["c2"])
        self.assertEqual(c_card.properties["title"], "Title")

        c_col = MaterialColumn("c2", children=["c3"], spacing=16)
        self.assertEqual(c_col.properties["spacing"], 16)

        c_row = MaterialRow("c3", children=["c4"], spacing=8, align_items="flex-start")
        self.assertEqual(c_row.properties["alignItems"], "flex-start")

        c_grid = MaterialGridList("c4", columns=3, spacing=12)
        self.assertEqual(c_grid.properties["columns"], 3)

        c_exp = MaterialExpansionPanel("c5", title="Details", expanded=True)
        self.assertTrue(c_exp.properties["expanded"])

        c_div = MaterialDivider("c6")
        self.assertEqual(c_div.component, "Divider")

        c_tabs = MaterialTabs("c7", tabs=[{"id": "t1", "label": "T1"}], active_tab=1)
        self.assertEqual(c_tabs.properties["activeTab"], 1)

        c_dialog = MaterialDialog("c8", title="Confirm", open_state=True)
        self.assertTrue(c_dialog.properties["open"])

        c_txt = MaterialText("c9", text="Hello", variant="headline")
        self.assertEqual(c_txt.properties["variant"], "headline")

        c_badge = MaterialBadge("c10", text="CRITICAL", color="error")
        self.assertEqual(c_badge.properties["color"], "error")

        c_icon = MaterialIcon("c11", icon_name="star")
        self.assertEqual(c_icon.properties["iconName"], "star")

        c_img = MaterialImage("c12", src="https://example.com/logo.png", alt="Logo", width=100)
        self.assertEqual(c_img.properties["src"], "https://example.com/logo.png")

        c_pbar = MaterialProgressBar("c13", value=50, max_val=100)
        self.assertEqual(c_pbar.properties["value"], 50)

        c_pspin = MaterialProgressSpinner("c14", diameter=48)
        self.assertEqual(c_pspin.properties["diameter"], 48)

        c_btn = MaterialButton("c15", label="Save", action={"name": "save"})
        self.assertEqual(c_btn.properties["label"], "Save")

        c_btntog = MaterialButtonToggle("c16", options=[{"label": "A", "value": "a"}], value_path="/val")
        self.assertEqual(c_btntog.properties["value"]["path"], "/val")

        c_inp = MaterialInput("c17", label="Name", value_path="/form/name", placeholder="Enter name")
        self.assertEqual(c_inp.properties["value"]["path"], "/form/name")

        c_sel = MaterialSelect("c18", label="Tier", value_path="/form/tier", options=[{"label": "Pro", "value": "p"}])
        self.assertEqual(c_sel.properties["value"]["path"], "/form/tier")

        c_rad = MaterialRadioButton("c19", label="Role", value_path="/form/role")
        self.assertEqual(c_rad.properties["value"]["path"], "/form/role")

        c_chk = MaterialCheckbox("c20", label="Agree", checked_path="/form/agree")
        self.assertEqual(c_chk.properties["checked"]["path"], "/form/agree")

        c_slide = MaterialSlideToggle("c21", label="Armor", checked_path="/form/armor")
        self.assertEqual(c_slide.properties["checked"]["path"], "/form/armor")

        c_chips = MaterialChips("c22", label="Tags", value_path="/form/tags")
        self.assertEqual(c_chips.properties["value"]["path"], "/form/tags")

        c_slider = MaterialSlider("c23", label="Budget", value_path="/form/budget", min_val=10, max_val=100)
        self.assertEqual(c_slider.properties["max"], 100)

        c_date = MaterialDatepicker("c24", label="Launch", value_path="/form/launch")
        self.assertEqual(c_date.properties["value"]["path"], "/form/launch")

        c_time = MaterialTimepicker("c25", label="Window", value_path="/form/window")
        self.assertEqual(c_time.properties["value"]["path"], "/form/window")

        c_tbl = MaterialTable("c26", columns=[{"id": "a"}], rows=[{"a": 1}])
        self.assertEqual(len(c_tbl.properties["rows"]), 1)

        c_rtbl = RichTable("c27", title="Rich", columns=[{"id": "b"}], rows=[{"b": 2}])
        self.assertEqual(c_rtbl.properties["title"], "Rich")

        c_step = Stepper("c28", steps=[{"id": "s1"}], active_step=2)
        self.assertEqual(c_step.properties["activeStep"], 2)

        c_vega = VegaChart("c29", spec={"mark": "bar"}, title="Chart")
        self.assertEqual(c_vega.properties["spec"]["mark"], "bar")

        c_ichart = InteractiveChart("c30", chart_type="line", data=[{"x": 1}])
        self.assertEqual(c_ichart.properties["chartType"], "line")

        c_map = GoogleMap("c31", zoom=12)
        self.assertEqual(c_map.properties["zoom"], 12)

        c_car = MosaicCarousel("c32", children=["c33"], title="Carousel")
        self.assertEqual(c_car.properties["title"], "Carousel")

        c_slidecard = MosaicSlideCard("c33", title="Slide 1", subtitle="Sub")
        self.assertEqual(c_slidecard.properties["title"], "Slide 1")

        c_wo = WorkOrderList("c34", items=[{"id": "wo1"}], title="Orders")
        self.assertEqual(len(c_wo.properties["items"]), 1)

        c_rpanel = RightPanelForm("c35", title="Panel Form")
        self.assertEqual(c_rpanel.properties["title"], "Panel Form")

    def test_surface_builder_and_envelope(self):
        """Verifies A2uiSurfaceBuilder constructs valid A2UI v0.9.1 message envelopes."""
        builder = A2uiSurfaceBuilder(surface_id="test-surf", catalog_id=COMPOSITE_CATALOG_ID)
        builder.set_root("root-card")
        builder.add_component(MaterialCard("root-card", title="Test Root"))
        builder.set_data_model({"count": 42})

        envelope = builder.build()
        self.assertIn("messages", envelope)
        self.assertEqual(len(envelope["messages"]), 3)

        msg0 = envelope["messages"][0]["createSurface"]
        self.assertEqual(msg0["surfaceId"], "test-surf")
        self.assertEqual(msg0["rootComponentId"], "root-card")

        msg1 = envelope["messages"][1]["updateComponents"]
        self.assertEqual(msg1["surfaceId"], "test-surf")
        self.assertEqual(len(msg1["components"]), 1)

        msg2 = envelope["messages"][2]["updateDataModel"]
        self.assertEqual(msg2["surfaceId"], "test-surf")
        self.assertEqual(msg2["data"]["count"], 42)

        part = builder.to_part()
        self.assertEqual(part["mimeType"], "application/a2ui+json")
        self.assertEqual(part["data"], envelope)


class TestA2UIKitchenSinkSurfaces(unittest.TestCase):
    """Validates Gallery, Form Wizard, and Final Summary surfaces."""

    def test_widget_gallery_surface(self):
        """Validates build_widget_gallery_surface contains all required sections."""
        surface = build_widget_gallery_surface()
        self.assertIn("messages", surface)
        msgs = surface["messages"]

        create_msg = msgs[0]["createSurface"]
        self.assertEqual(create_msg["surfaceId"], "kitchen-sink-gallery")

        comps_msg = msgs[1]["updateComponents"]
        comps = {c["id"]: c for c in comps_msg["components"]}

        # Check key components from each section
        self.assertIn("gallery-stepper", comps)
        self.assertIn("card-layout-showcase", comps)
        self.assertIn("card-form-controls", comps)
        self.assertIn("card-data-tables", comps)
        self.assertIn("card-charts-geo", comps)
        self.assertIn("card-carousel", comps)

        # Check interactive controls exist
        self.assertIn("ctrl-input-text", comps)
        self.assertIn("ctrl-select-tier", comps)
        self.assertIn("ctrl-radio-role", comps)
        self.assertIn("ctrl-checkbox", comps)
        self.assertIn("ctrl-slidetoggle", comps)
        self.assertIn("ctrl-chips", comps)
        self.assertIn("ctrl-slider", comps)
        self.assertIn("ctrl-datepicker", comps)
        self.assertIn("ctrl-timepicker", comps)

        # Check data model
        data_model = msgs[2]["updateDataModel"]["data"]
        self.assertIn("demo", data_model)

        # Check MosaicSlideCard items have hero imageUrl and badge
        for slide_id in ("slide-1", "slide-2", "slide-3", "slide-4"):
            self.assertIn(slide_id, comps)
            slide_props = comps[slide_id]["properties"]
            self.assertIn("imageUrl", slide_props)
            self.assertTrue(slide_props["imageUrl"].startswith("https://picsum.photos/"))
            self.assertIn("badge", slide_props)
            self.assertIn("description", slide_props)

    def test_widget_gallery_focused_sections(self):
        """Validates focused section surfaces for map, charts, badges, carousel, layout, tables, and forms."""
        section_expectations = {
            "map": "map-deployment-nodes",
            "charts": "chart-eval-scores",
            "badges": "row-badges",
            "carousel": "carousel-demo",
            "layout": "tabs-demo",
            "tables": "table-service-catalog",
            "forms": "ctrl-input-text",
        }
        for section, expected_comp_id in section_expectations.items():
            surface = build_widget_gallery_surface(section=section)
            comps = {c["id"]: c for c in surface["messages"][1]["updateComponents"]["components"]}
            self.assertIn(
                expected_comp_id,
                comps,
                f"Section '{section}' surface missing expected component '{expected_comp_id}'",
            )
            # Also verify render_kitchen_sink_surface(mode=section)
            tool_surf = render_kitchen_sink_surface(mode=section)
            tool_comps = {c["id"]: c for c in tool_surf["messages"][1]["updateComponents"]["components"]}
            self.assertIn(expected_comp_id, tool_comps)

    def test_form_wizard_surface_and_bindings(self):
        """Validates build_form_wizard_surface binds all 12 form fields and action context."""
        surface = build_form_wizard_surface(active_step=1)
        msgs = surface["messages"]
        create_msg = msgs[0]["createSurface"]
        self.assertEqual(create_msg["surfaceId"], "kitchen-sink-form-wizard")

        comps = {c["id"]: c for c in msgs[1]["updateComponents"]["components"]}

        # Verify all 12 input components
        expected_bindings = [
            ("form-inp-name", "/form/agentName"),
            ("form-inp-email", "/form/ownerEmail"),
            ("form-sel-env", "/form/environment"),
            ("form-radio-tier", "/form/reasoningTier"),
            ("form-chips-cap", "/form/capabilities"),
            ("form-slider-conf", "/form/confidenceThreshold"),
            ("form-toggle-armor", "/form/enableModelArmor"),
            ("form-chk-hitl", "/form/requireHitlApproval"),
            ("form-date-launch", "/form/launchDate"),
            ("form-time-maint", "/form/maintenanceWindow"),
            ("form-slider-budget", "/form/computeBudgetUsd"),
            ("form-inp-notes", "/form/notes"),
        ]

        for comp_id, pointer_path in expected_bindings:
            self.assertIn(comp_id, comps, f"Missing component: {comp_id}")
            props = comps[comp_id].get("properties", {})
            val = props.get("value") or props.get("checked")
            self.assertIsNotNone(val, f"Component {comp_id} has no value/checked prop")
            self.assertEqual(val.get("path"), pointer_path, f"Component {comp_id} path mismatch")

        # Verify Submit Button context binds all 12 fields
        btn = comps["btn-submit-kitchen-sink-form"]
        btn_action = btn["properties"]["action"]
        self.assertEqual(btn_action["name"], "submit_kitchen_sink_form")
        ctx = btn_action["context"]
        self.assertEqual(len(ctx), 12)
        self.assertEqual(ctx["agentName"]["path"], "/form/agentName")
        self.assertEqual(ctx["computeBudgetUsd"]["path"], "/form/computeBudgetUsd")
        self.assertEqual(ctx["requireHitlApproval"]["path"], "/form/requireHitlApproval")

    def test_final_summary_surface_and_delta(self):
        """Validates build_final_summary_surface displays delta table, Vega chart, and raw state."""
        state = {
            "kitchen_sink_submission": {
                "agentName": "custom-agent-override",
                "computeBudgetUsd": 7500,
            }
        }
        surface = build_final_summary_surface(state)
        msgs = surface["messages"]
        create_msg = msgs[0]["createSurface"]
        self.assertEqual(create_msg["surfaceId"], "kitchen-sink-final-summary")

        comps = {c["id"]: c for c in msgs[1]["updateComponents"]["components"]}

        # Stepper at Step 4
        self.assertIn("summary-stepper", comps)
        self.assertEqual(comps["summary-stepper"]["properties"]["activeStep"], 4)

        # Comparison table
        self.assertIn("table-comparison", comps)
        table_rows = comps["table-comparison"]["properties"]["rows"]
        self.assertTrue(any(r["field"] == "Agent System Name" and r["submittedValue"] == "custom-agent-override" and r["status"] == "CHANGED" for r in table_rows))

        # VegaChart with budget breakdown
        self.assertIn("chart-budget-breakdown", comps)
        spec = comps["chart-budget-breakdown"]["properties"]["spec"]
        values = spec["data"]["values"]
        self.assertEqual(len(values), 4)
        total_allocation = sum(v["allocation"] for v in values)
        self.assertAlmostEqual(total_allocation, 7500, places=1)

        # Raw state panel
        self.assertIn("panel-raw-state-inspector", comps)
        self.assertIn("text-raw-state-json", comps)


class TestA2uiAdaptorAndTools(unittest.TestCase):
    """Validates A2uiAdaptor routing, form submission persistence, and tool queries."""

    def test_deterministic_utility_actions(self):
        """Verifies utility actions (help, about, show_gallery, show_wizard, show_summary)."""
        res_help = A2uiAdaptor.handle_user_action("help")
        self.assertEqual(res_help["status"], "handled")
        self.assertEqual(res_help["surface"]["messages"][0]["createSurface"]["surfaceId"], "help-surface")

        res_about = A2uiAdaptor.handle_user_action("about")
        self.assertEqual(res_about["status"], "handled")
        self.assertEqual(res_about["surface"]["messages"][0]["createSurface"]["surfaceId"], "about-surface")

        res_gallery = A2uiAdaptor.handle_user_action("show_gallery")
        self.assertEqual(res_gallery["status"], "handled")
        self.assertEqual(res_gallery["surface"]["messages"][0]["createSurface"]["surfaceId"], "kitchen-sink-gallery")

        res_wizard = A2uiAdaptor.handle_user_action("show_wizard", {"step": 2})
        self.assertEqual(res_wizard["status"], "handled")
        self.assertEqual(res_wizard["surface"]["messages"][0]["createSurface"]["surfaceId"], "kitchen-sink-form-wizard")

    def test_submit_kitchen_sink_form_persistence(self):
        """Verifies submit_kitchen_sink_form persists values into session.state, returns delta, and summary surface."""
        session_state = {}
        submitted_context = {
            "agentName": "production-copilot-omega",
            "ownerEmail": "dev-lead@company.com",
            "environment": "production",
            "reasoningTier": "deep_think",
            "capabilities": ["search", "code_execution", "a2ui"],
            "computeBudgetUsd": 8000,
            "confidenceThreshold": 95,
            "enableModelArmor": True,
            "requireHitlApproval": False,
            "launchDate": "2026-12-01",
            "maintenanceWindow": "04:00",
            "notes": "Verified by security lead",
        }

        result = A2uiAdaptor.handle_user_action(
            action_name="submit_kitchen_sink_form",
            context=submitted_context,
            session_state=session_state,
        )

        self.assertEqual(result["status"], "handled")
        self.assertIn("kitchen_sink_submission", session_state)
        sub = session_state["kitchen_sink_submission"]

        # Check values in session_state
        self.assertEqual(sub["agentName"], "production-copilot-omega")
        self.assertEqual(sub["computeBudgetUsd"], 8000)
        self.assertEqual(sub["requireHitlApproval"], False)
        self.assertEqual(len(session_state["submission_history"]), 1)

        # Check state_delta
        self.assertEqual(result["state_delta"]["kitchen_sink_submission"]["computeBudgetUsd"], 8000)

        # Check surface is final summary
        self.assertEqual(result["surface"]["messages"][0]["createSurface"]["surfaceId"], "kitchen-sink-final-summary")

    def test_subsequent_turn_query_via_tools(self):
        """Verifies querying persisted state on a subsequent turn using kitchen_sink_tools."""
        session_state = {
            "kitchen_sink_submission": {
                "agentName": "persistent-turn-2-agent",
                "computeBudgetUsd": 6500,
            },
            "submission_history": [{"timestamp": "2026-10-14T20:00:00Z"}],
        }

        # Query state
        state_info = get_current_form_state(session_state)
        self.assertEqual(state_info["status"], "success")
        self.assertEqual(state_info["configuration"]["agentName"], "persistent-turn-2-agent")
        self.assertEqual(state_info["configuration"]["computeBudgetUsd"], 6500)
        self.assertEqual(state_info["submissionCount"], 1)

        # Render surface tool
        surf = render_kitchen_sink_surface(mode="summary", session_state=session_state)
        self.assertEqual(surf["messages"][0]["createSurface"]["surfaceId"], "kitchen-sink-final-summary")

        # Submit tool
        res = submit_and_persist_form({"computeBudgetUsd": 9000}, session_state=session_state)
        self.assertEqual(res["status"], "handled")
        self.assertEqual(session_state["kitchen_sink_submission"]["computeBudgetUsd"], 9000)
        self.assertEqual(len(session_state["submission_history"]), 2)

    def test_reset_state_action(self):
        """Verifies reset_state resets session.state back to defaults."""
        session_state = {
            "kitchen_sink_submission": {"agentName": "modified-name"},
            "submission_history": [{"dummy": True}],
        }
        res = A2uiAdaptor.handle_user_action("reset_state", session_state=session_state)
        self.assertEqual(res["status"], "handled")
        self.assertEqual(session_state["kitchen_sink_submission"]["agentName"], "enterprise-copilot-v1")
        self.assertEqual(len(session_state["submission_history"]), 0)

    def test_route_user_action_component_specific_prompts(self):
        """Verifies natural-language prompts for Map, Vega-Lite Charts, Badges, Carousel, and Layout route to live A2UI surfaces."""
        prompt_expectations = [
            ("Show me the Map component", "map-deployment-nodes"),
            ("Show me the Vega Lite Charts", "chart-eval-scores"),
            ("Show me Badges & Feedback", "row-badges"),
            ("Show me the Mosaic Carousel", "carousel-demo"),
            ("Show me the Layout controls", "tabs-demo"),
            ("Show me the Data Tables and Work Orders", "table-service-catalog"),
            ("Show me the Form Controls", "ctrl-input-text"),
        ]
        for prompt, expected_comp_id in prompt_expectations:
            routed = A2uiAdaptor.route_user_action(prompt, session_state={})
            self.assertEqual(routed["status"], "handled", f"Prompt '{prompt}' was not handled")
            comps = {
                c["id"]: c
                for c in routed["surface"]["messages"][1]["updateComponents"]["components"]
            }
            self.assertIn(
                expected_comp_id,
                comps,
                f"Prompt '{prompt}' did not include component '{expected_comp_id}'",
            )


class TestA2UIKitchenSinkAgentBlueprint(unittest.TestCase):
    """Validates the .agent blueprint file compliance."""

    @classmethod
    def setUpClass(cls):
        blueprint_path = os.path.join(
            os.path.dirname(__file__), "..", "a2ui_kitchen_sink.agent"
        )
        with open(blueprint_path, "r", encoding="utf-8") as f:
            cls.blueprint = json.load(f)

    def test_8pt_grid_coordinates(self):
        """Validates every node coordinate (x, y) is an exact multiple of 8."""
        for node in self.blueprint["nodes"]:
            pos = node.get("position", {})
            x = pos.get("x", 0)
            y = pos.get("y", 0)
            self.assertEqual(
                x % 8, 0, f"Node {node['id']} x-coord {x} is not a multiple of 8"
            )
            self.assertEqual(
                y % 8, 0, f"Node {node['id']} y-coord {y} is not a multiple of 8"
            )

    def test_models_and_vertex_location(self):
        """Validates all agent nodes use gemini-3.8-flash and global location."""
        agent_nodes = [n for n in self.blueprint["nodes"] if n["type"] == "agentNode"]
        self.assertGreaterEqual(len(agent_nodes), 4)

        for agent in agent_nodes:
            model = agent["data"]["model"]
            self.assertEqual(
                model,
                "gemini-3.8-flash",
                f"Agent {agent['id']} model must be gemini-3.8-flash",
            )

        deploy_cfg = self.blueprint.get("deployment", {}).get("deploymentConfig", {})
        self.assertEqual(deploy_cfg.get("location"), "global")

    def test_a2ui_config_on_root_coordinator(self):
        """Validates standard default a2uiConfig on root and all sub-agent nodes."""
        expected_a2ui_cfg = {
            "enabled": True,
            "catalog": "gemini_enterprise_composite_v09",
            "generationMode": "state_adapter",
            "enableNonLlmUtilityActions": True,
        }
        agent_nodes = [n for n in self.blueprint["nodes"] if n["type"] == "agentNode"]
        self.assertEqual(len(agent_nodes), 4)
        for node in agent_nodes:
            a2ui_cfg = node["data"].get("a2uiConfig", {})
            self.assertEqual(
                a2ui_cfg,
                expected_a2ui_cfg,
                f"Agent {node['id']} must use standard default a2uiConfig",
            )

    def test_edges_and_styling(self):
        """Validates triggers use dashed amber and sub-agent edges use solid blue."""
        edges = self.blueprint["edges"]
        self.assertGreaterEqual(len(edges), 5)

        for edge in edges:
            style = edge.get("style", {})
            if "trigger" in edge["source"]:
                self.assertEqual(style.get("stroke"), "#f59e0b")
                self.assertEqual(style.get("strokeDasharray"), "5 5")
            else:
                self.assertEqual(style.get("stroke"), "#3b82f6")

    def test_test_suite_scenarios(self):
        """Validates test suite trigger contains 12 evaluation test scenarios."""
        tester = next(
            n for n in self.blueprint["nodes"] if n["id"] == "node-trigger-kitchen-sink-tester"
        )
        scenarios = tester["data"]["config"]["testScenarios"]
        self.assertGreaterEqual(len(scenarios), 12)


if __name__ == "__main__":
    unittest.main()

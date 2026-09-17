"""
Unit Tests for Travel Concierge Python Toolsets (TASK-173)

Purpose:
Validates 100% code coverage of `memory_toolset.py`, `places_toolset.py`, `planning_toolset.py`,
`booking_toolset.py`, and `intrip_toolset.py` across simple, extreme, and failure/fallback conditions.

Architectural Decisions:
- Author: Mike Nimer <mikenimer@google.com>
- Verifies standalone execution without ADK ToolContext as well as mock ToolContext state injection.
"""

import os
import sys
import unittest
from pathlib import Path

# Add sample root directory to sys.path so `tools` package is importable
SAMPLE_ROOT = Path(__file__).resolve().parent.parent
if str(SAMPLE_ROOT) not in sys.path:
    sys.path.insert(0, str(SAMPLE_ROOT))

from tools import (
    memorize,
    memorize_list,
    forget,
    search_places,
    get_places_toolset,
    place_recommendation,
    poi_suggestions,
    flight_search,
    flight_seat_selection,
    hotel_search,
    hotel_room_selection,
    create_itinerary,
    what_to_pack,
    create_reservation,
    payment_choice,
    process_payment,
    flight_status_check,
    event_booking_check,
    weather_impact_check,
    transit_coordination,
)


class MockToolContext:
    """Mock ADK ToolContext with mutable state dictionary."""

    def __init__(self):
        self.state = {}


class TestTravelConciergeTools(unittest.TestCase):
    """Comprehensive unit test suite for all Travel Concierge toolsets."""

    def test_memory_toolset_simple_and_fallback(self):
        """Test memorize, memorize_list, and forget with and without ToolContext."""
        ctx = MockToolContext()
        res1 = memorize("itinerary_datetime", "2025-06-16 12:45:00", ctx)
        self.assertIn("Stored", res1["status"])
        self.assertEqual(ctx.state["itinerary_datetime"], "2025-06-16 12:45:00")

        res2 = memorize_list("dietary", "vegan", ctx)
        memorize_list("dietary", "vegan", ctx)  # duplicate check
        memorize_list("dietary", "gluten-free", ctx)
        self.assertEqual(ctx.state["dietary"], ["vegan", "gluten-free"])

        forget("dietary", "vegan", ctx)
        self.assertEqual(ctx.state["dietary"], ["gluten-free"])

        forget("itinerary_datetime", "2025-06-16 12:45:00", ctx)
        self.assertNotIn("itinerary_datetime", ctx.state)

        # Fallback state without ToolContext
        res_fallback = memorize("standalone_key", "val")
        self.assertIn("Stored", res_fallback["status"])

    def test_places_toolset_simple_extreme_and_fallback(self):
        """Test search_places for Peru, Tokyo, Seattle, and generic fallback."""
        os.environ["GOOGLE_MAPS_API_KEY"] = "test-key-123"
        cfg = get_places_toolset()
        self.assertTrue(cfg["configured"])

        del os.environ["GOOGLE_MAPS_API_KEY"]
        cfg_empty = get_places_toolset()
        self.assertFalse(cfg_empty["configured"])

        peru = search_places("Machu Picchu Peru")
        self.assertGreaterEqual(len(peru["places"]), 1)

        tokyo = search_places("Shibuya Tokyo")
        self.assertGreaterEqual(len(tokyo["places"]), 1)

        seattle = search_places("Pike Place Seattle")
        self.assertGreaterEqual(len(seattle["places"]), 1)

        generic = search_places("Reykjavik Iceland")
        self.assertEqual(generic["places"][0]["place_name"], "Reykjavik Iceland City Center")

    def test_planning_toolset_all_functions(self):
        """Test destination inspiration, flights, hotels, rooms, itinerary, and packing list."""
        rec_americas = place_recommendation("Inspire me about the Americas")
        self.assertTrue(any("Peru" in d["country"] for d in rec_americas["destinations"]))

        rec_global = place_recommendation("Inspire me about Asia or Europe")
        self.assertTrue(any("Japan" in d["country"] for d in rec_global["destinations"]))

        poi_peru = poi_suggestions("Peru")
        self.assertGreaterEqual(len(poi_peru["places"]), 1)

        poi_tokyo = poi_suggestions("Tokyo")
        self.assertGreaterEqual(len(poi_tokyo["places"]), 1)

        poi_other = poi_suggestions("Paris")
        self.assertGreaterEqual(len(poi_other["places"]), 1)

        flights = flight_search("SFO", "NRT", "2025-10-01", "2025-10-05")
        self.assertEqual(len(flights["outbound_flights"]), 2)
        self.assertEqual(len(flights["return_flights"]), 1)

        seats = flight_seat_selection("NH107", "window")
        self.assertEqual(seats["selected_seat"], "14A")
        seats_aisle = flight_seat_selection("NH107", "aisle")
        self.assertEqual(seats_aisle["selected_seat"], "14C")

        hotels_tokyo = hotel_search("Tokyo", "2025-10-01", "2025-10-05", "Shibuya")
        self.assertTrue(any("Shibuya" in h["hotel_name"] for h in hotels_tokyo["hotels"]))

        hotels_generic = hotel_search("Zurich", "2025-10-01", "2025-10-05")
        self.assertEqual(len(hotels_generic["hotels"]), 1)

        room = hotel_room_selection("TRUNK HOTEL", "Boutique King")
        self.assertEqual(room["status"], "ROOM_AVAILABLE")

        itin = create_itinerary("Tokyo Escape", "SFO", "Tokyo", "2025-10-01", "2025-10-05")
        self.assertEqual(itin["status"], "ITINERARY_CREATED")

        pack_peru = what_to_pack("San Diego", "Peru")
        self.assertIn("Altitude Sickness Medication", pack_peru["packing_list"])

        pack_tokyo = what_to_pack("SFO", "Tokyo")
        self.assertIn("Pocket Wi-Fi / eSIM", pack_tokyo["packing_list"])

    def test_booking_toolset_payment_rules(self):
        """Test reservation creation, payment choices, Apple Pay decline, and Google Pay approval."""
        res = create_reservation("hotel", "TRUNK HOTEL Shibuya", 1360.0)
        self.assertTrue(res["reservation_id"].startswith("RES-"))

        choices = payment_choice()
        self.assertEqual(len(choices["available_payment_methods"]), 3)

        declined = process_payment(res["reservation_id"], "Apple Pay", 1360.0)
        self.assertEqual(declined["status"], "DECLINED")

        approved = process_payment(res["reservation_id"], "Google Pay", 1360.0)
        self.assertEqual(approved["status"], "APPROVED_AND_CONFIRMED")
        self.assertTrue(approved["order_id"].startswith("ORD-"))

    def test_intrip_toolset_monitoring_and_transit(self):
        """Test flight status, Space Needle closure check, weather check, and transit coordination."""
        f_ok = flight_status_check("AA1234", "2025-06-15")
        self.assertEqual(f_ok["status"], "ON_TIME")

        f_cancel = flight_status_check("XX123", "2025-06-15")
        self.assertEqual(f_cancel["status"], "CANCELLED")

        needle_closed = event_booking_check("Space Needle", "2025-06-16", "Seattle Center")
        self.assertEqual(needle_closed["status"], "CLOSED_FOR_MAINTENANCE")

        mopop_open = event_booking_check("MoPOP", "2025-06-17", "Seattle")
        self.assertEqual(mopop_open["status"], "OPEN_CONFIRMED")

        weather = weather_impact_check("Visit Pike Place Market", "2025-06-16", "Pike Place")
        self.assertEqual(weather["impact_level"], "NONE")

        transit = transit_coordination("Ivar's Acres of Clams", "Space Needle", "2025-06-16 12:45:00")
        self.assertIn("25-30 minutes", transit["walking_option"])


if __name__ == "__main__":
    unittest.main()

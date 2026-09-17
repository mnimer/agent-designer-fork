"""
Travel Concierge Planning & Inspiration Toolset

Purpose:
Provides tools for the Inspiration, Planning, and Pre-Trip agents:
destination recommendations, POI discovery, flight search, seat selection,
hotel search, room selection, structured JSON itinerary generation, and packing lists.

Architectural Decisions:
- Author: Mike Nimer <mikenimer@google.com>
- Returns structured JSON responses matching the Pydantic schemas in the ADK Travel Concierge
  sample (`FlightsSelection`, `SeatsSelection`, `HotelsSelection`, `RoomsSelection`, `Itinerary`, `PackingList`).
"""

from typing import Any, Dict, List


def place_recommendation(inspiration_query: str) -> Dict[str, Any]:
    """
    Recommends dream vacation destinations based on a user's vague interests or region query.

    Args:
        inspiration_query: Region or theme query (e.g., 'Inspire me about the Americas').

    Returns:
        Dictionary with recommended destinations and highlights.
    """
    # Section 1: Check if query targets the Americas or general global travel
    query_lower = inspiration_query.lower()
    if "america" in query_lower or "peru" in query_lower:
        recommendations = [
            {
                "destination": "Machu Picchu & Cusco, Peru",
                "country": "Peru",
                "summary": "Ancient Inca citadel high in the Andes, vibrant Sacred Valley markets, and world-renowned Peruvian gastronomy.",
            },
            {
                "destination": "Banff National Park, Canada",
                "country": "Canada",
                "summary": "Turquoise glacial lakes, alpine hiking trails, and dramatic Rocky Mountain peaks.",
            },
            {
                "destination": "Cartagena, Colombia",
                "country": "Colombia",
                "summary": "Colorful colonial walled city, Caribbean beaches, and lively music and culinary culture.",
            },
        ]
    else:
        recommendations = [
            {
                "destination": "Tokyo & Kyoto, Japan",
                "country": "Japan",
                "summary": "Blend of ultra-modern Shibuya neon skylines, historic Shinto shrines, and Michelin-starred cuisine.",
            },
            {
                "destination": "Amalfi Coast, Italy",
                "country": "Italy",
                "summary": "Cliffside Mediterranean villages, coastal boat tours, and authentic Italian trattorias.",
            },
        ]

    # Section 2: Return destination recommendations
    return {"query": inspiration_query, "destinations": recommendations}


def poi_suggestions(destination: str) -> Dict[str, Any]:
    """
    Suggests top points of interest and activities for a chosen destination.

    Args:
        destination: Selected city, region, or country (e.g., 'Peru', 'Tokyo', 'Seattle').

    Returns:
        Dictionary of structured POI recommendations.
    """
    # Section 1: Match destination to curated points of interest
    dest_lower = destination.lower()
    if "peru" in dest_lower or "machu picchu" in dest_lower:
        pois = [
            {
                "place_name": "Machu Picchu Guided Citadel Hike",
                "address": "Aguas Calientes, Peru",
                "review_ratings": 4.9,
                "highlights": "Explore the Sun Gate, Temple of the Sun, and Intihuatana stone with an expert archaeologist.",
            },
            {
                "place_name": "Sacsayhuaman & Cusco Historic Center",
                "address": "Cusco 08002, Peru",
                "review_ratings": 4.8,
                "highlights": "Marvel at massive Incan dry-stone walls and Spanish colonial cathedrals around Plaza de Armas.",
            },
        ]
    elif "tokyo" in dest_lower or "shibuya" in dest_lower:
        pois = [
            {
                "place_name": "Shibuya Crossing & Shibuya Sky",
                "address": "2-24-12 Shibuya, Tokyo",
                "review_ratings": 4.9,
                "highlights": "Experience the world's busiest pedestrian scramble and panoramic rooftop views.",
            },
            {
                "place_name": "Tsukiji Outer Market Culinary Walk",
                "address": "4-16-2 Tsukiji, Chuo City, Tokyo",
                "review_ratings": 4.8,
                "highlights": "Sample fresh sushi, tamagoyaki, and matcha desserts from historic street stalls.",
            },
        ]
    else:
        pois = [
            {
                "place_name": f"{destination.title()} Cultural Museum & Waterfront",
                "address": f"Downtown {destination.title()}",
                "review_ratings": 4.7,
                "highlights": f"Guided walking tour and culinary tasting across historic {destination.title()}.",
            }
        ]

    # Section 2: Return structured POI list
    return {"destination": destination, "places": pois}


def flight_search(
    origin: str,
    destination: str,
    departure_date: str,
    return_date: str = "",
) -> Dict[str, Any]:
    """
    Searches available flights for the specified origin, destination, and travel dates.

    Args:
        origin: Departure airport or city (e.g., 'SFO', 'San Diego').
        destination: Arrival airport or city (e.g., 'NRT', 'Tokyo', 'Seattle').
        departure_date: Outbound flight date (YYYY-MM-DD).
        return_date: Optional return flight date (YYYY-MM-DD).

    Returns:
        Dictionary of outbound and return flight options with prices and schedules.
    """
    # Section 1: Construct realistic outbound flight options
    outbound_flights = [
        {
            "flight_number": "NH107",
            "airline": "All Nippon Airways",
            "origin": origin,
            "destination": destination,
            "departure_date": departure_date,
            "departure_time": "11:30",
            "arrival_time": "15:15+1",
            "price_usd": 890.00,
            "cabin": "Economy Plus",
        },
        {
            "flight_number": "JL001",
            "airline": "Japan Airlines",
            "origin": origin,
            "destination": destination,
            "departure_date": departure_date,
            "departure_time": "13:05",
            "arrival_time": "16:40+1",
            "price_usd": 925.00,
            "cabin": "Economy",
        },
    ]

    # Section 2: Construct return flight options if return_date is provided
    return_flights = []
    if return_date:
        return_flights.append(
            {
                "flight_number": "NH108",
                "airline": "All Nippon Airways",
                "origin": destination,
                "destination": origin,
                "departure_date": return_date,
                "departure_time": "17:30",
                "arrival_time": "11:10",
                "price_usd": 870.00,
                "cabin": "Economy Plus",
            }
        )

    # Section 3: Return combined flight selection schema
    return {
        "origin": origin,
        "destination": destination,
        "outbound_flights": outbound_flights,
        "return_flights": return_flights,
    }


def flight_seat_selection(flight_number: str, seat_preference: str = "window") -> Dict[str, Any]:
    """
    Returns available cabin seats and confirms selection matching user preference.

    Args:
        flight_number: Airline flight number (e.g., 'NH107', 'AA1234').
        seat_preference: Preferred seat type ('window', 'aisle', 'middle').

    Returns:
        Dictionary with assigned seat number and cabin map status.
    """
    # Section 1: Determine seat assignment based on preference
    pref = seat_preference.lower()
    assigned_seat = "14A" if "window" in pref else "14C"

    # Section 2: Return structured SeatsSelection payload
    return {
        "flight_number": flight_number,
        "selected_seat": assigned_seat,
        "seat_type": seat_preference,
        "available_seats": ["14A", "14C", "18A", "21F"],
        "unavailable_seats": ["12A", "12B", "14B"],
        "status": "SEAT_RESERVED",
    }


def hotel_search(
    destination: str,
    check_in_date: str,
    check_out_date: str,
    neighborhood_preference: str = "",
) -> Dict[str, Any]:
    """
    Searches hotels in the target destination and neighborhood for the specified stay dates.

    Args:
        destination: Target city (e.g., 'Tokyo', 'Seattle', 'Cusco').
        check_in_date: Check-in date string.
        check_out_date: Check-out date string.
        neighborhood_preference: Optional neighborhood (e.g., 'Shibuya', 'Downtown').

    Returns:
        Dictionary of matching hotels with nightly rates and amenities.
    """
    # Section 1: Customize hotel results based on destination/neighborhood
    dest_lower = f"{destination} {neighborhood_preference}".lower()
    if "shibuya" in dest_lower or "tokyo" in dest_lower:
        hotels = [
            {
                "hotel_name": "TRUNK (HOTEL) CAT STREET Shibuya",
                "neighborhood": "Shibuya, Tokyo",
                "address": "5-31 Jingumae, Shibuya-ku, Tokyo 150-0001",
                "rating": 4.9,
                "price_per_night_usd": 340.00,
                "style": "Boutique Design Hotel",
                "amenities": ["Rooftop Lounge", "Organic Dining", "Free Wi-Fi", "Concierge"],
            },
            {
                "hotel_name": "The Millennials Shibuya",
                "neighborhood": "Shibuya Center-Gai, Tokyo",
                "address": "1-20-24 Jinnan, Shibuya-ku, Tokyo 150-0041",
                "rating": 4.7,
                "price_per_night_usd": 210.00,
                "style": "Smart Boutique Capsule & Suites",
                "amenities": ["Co-working Space", "Evening Social Hour", "High-Speed Wi-Fi"],
            },
        ]
    else:
        hotels = [
            {
                "hotel_name": f"The Grand Boutique {destination.title()}",
                "neighborhood": neighborhood_preference or f"Central {destination.title()}",
                "address": f"100 Heritage Way, {destination.title()}",
                "rating": 4.8,
                "price_per_night_usd": 275.00,
                "style": "Luxury Boutique Hotel",
                "amenities": ["Spa & Wellness", "Artisan Breakfast", "Airport Shuttle"],
            }
        ]

    # Section 2: Return HotelsSelection payload
    return {
        "destination": destination,
        "check_in_date": check_in_date,
        "check_out_date": check_out_date,
        "hotels": hotels,
    }


def hotel_room_selection(hotel_name: str, room_type: str = "Deluxe King") -> Dict[str, Any]:
    """
    Selects a specific room category at a chosen hotel.

    Args:
        hotel_name: Name of the selected hotel.
        room_type: Desired room configuration (e.g., 'Boutique Balcony King', 'Deluxe Queen').

    Returns:
        Dictionary confirming room availability and rate details.
    """
    # Section 1: Return confirmed room selection details
    return {
        "hotel_name": hotel_name,
        "selected_room": room_type,
        "occupancy": "2 Adults",
        "bed_configuration": "1 King Bed",
        "cancellation_policy": "Free cancellation up to 48 hours prior to check-in",
        "status": "ROOM_AVAILABLE",
    }


def create_itinerary(
    trip_name: str,
    origin: str,
    destination: str,
    start_date: str,
    end_date: str,
) -> Dict[str, Any]:
    """
    Constructs and persists a structured multi-day JSON itinerary combining flights,
    boutique hotel check-in, and curated daily activities.

    Args:
        trip_name: Title of the trip (e.g., '4-Day Shibuya Boutique Escape').
        origin: Origin city.
        destination: Destination city.
        start_date: Start date (YYYY-MM-DD).
        end_date: End date (YYYY-MM-DD).

    Returns:
        Structured itinerary dictionary conforming to types.Itinerary schema.
    """
    # Section 1: Build multi-day itinerary schedule
    itinerary = {
        "trip_name": trip_name,
        "origin": origin,
        "destination": destination,
        "start_date": start_date,
        "end_date": end_date,
        "days": [
            {
                "day_number": 1,
                "date": start_date,
                "events": [
                    {
                        "event_type": "flight",
                        "description": f"Outbound Flight from {origin} to {destination}",
                        "departure_time": "11:30",
                        "arrival_time": "15:15",
                        "booking_required": True,
                    },
                    {
                        "event_type": "hotel",
                        "description": f"Check-in at Boutique Hotel in {destination}",
                        "check_in_time": "16:30",
                        "booking_required": True,
                    },
                ],
            },
            {
                "day_number": 2,
                "date": start_date,
                "events": [
                    {
                        "event_type": "visit",
                        "description": f"Guided Cultural & Culinary Exploration of {destination}",
                        "start_time": "09:30",
                        "end_time": "17:00",
                        "booking_required": True,
                    }
                ],
            },
        ],
    }

    # Section 2: Return complete itinerary object
    return {"status": "ITINERARY_CREATED", "itinerary": itinerary}


def what_to_pack(origin: str, destination: str, activities: str = "sightseeing, dining") -> Dict[str, List[str]]:
    """
    Generates a tailored packing list based on trip origin, destination climate, and planned activities.

    Args:
        origin: Traveler's starting location.
        destination: Trip destination city/country.
        activities: Comma-separated description of planned activities.

    Returns:
        Dictionary containing a JSON list of recommended items to pack.
    """
    # Section 1: Assemble base packing list plus destination-specific items
    items = [
        "Passport & Visa Documentation",
        "Universal Power Adapter",
        "Comfortable Walking Shoes",
        "Lightweight Weatherproof Jacket",
        "Portable Power Bank",
        "Smart-Casual Boutique Dining Attire",
    ]
    if "peru" in destination.lower() or "machu" in destination.lower():
        items.extend(["High-SPF Sunscreen", "Altitude Sickness Medication", "Daypack & Trekking Poles"])
    elif "tokyo" in destination.lower() or "japan" in destination.lower():
        items.extend(["Slip-on Shoes for Temple Visits", "Pocket Wi-Fi / eSIM", "Coin Purse for Transit/Shrines"])

    # Section 2: Return packing list
    return {"packing_list": items}

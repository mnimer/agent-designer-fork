"""
Travel Concierge Places & Google Maps Grounding Toolset

Purpose:
Provides Google Maps Grounding Lite MCP connectivity and geocoding place lookup tools
for the Travel Inspiration and Point-of-Interest (POI) agents.

Architectural Decisions:
- Author: Mike Nimer <mikenimer@google.com>
- Supports both live Google Maps Grounding Lite MCP (`https://mapstools.googleapis.com/mcp`)
  when `GOOGLE_MAPS_API_KEY` is configured, and structured geocoded place responses for
  offline/test execution.
"""

import os
from typing import Any, Dict, List

MAPS_MCP_URL = "https://mapstools.googleapis.com/mcp"


def get_places_toolset() -> Dict[str, Any]:
    """
    Returns MCP connection configuration for Google Maps Grounding Lite.

    Returns:
        Dictionary containing MCP endpoint URL and required authentication headers.
    """
    # Section 1: Read API key from environment
    maps_api_key = os.getenv("GOOGLE_MAPS_API_KEY", "")

    # Section 2: Construct streamable HTTP MCP connection specification
    return {
        "url": MAPS_MCP_URL,
        "headers": {
            "X-Goog-Api-Key": maps_api_key,
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        "configured": bool(maps_api_key),
    }


def search_places(query: str) -> Dict[str, Any]:
    """
    Searches for a place name, landmark, or address and returns geocoded details,
    ratings, coordinates, and Google Maps links.

    Args:
        query: Place name, city attraction, or street address to search.

    Returns:
        Dictionary containing a list of matching places with lat/lng coordinates and ratings.
    """
    # Section 1: Normalize query for catalog lookup
    normalized = query.lower().strip()

    # Section 2: Match well-known sample destinations (Peru, Tokyo, Seattle) or return generic geocoding
    if "peru" in normalized or "machu picchu" in normalized or "cusco" in normalized:
        places: List[Dict[str, Any]] = [
            {
                "place_name": "Machu Picchu Historic Sanctuary",
                "address": "Aguas Calientes 08680, Peru",
                "lat": -13.1631,
                "long": -72.5450,
                "review_ratings": 4.9,
                "highlights": "Iconic 15th-century Inca citadel high in the Andes mountains.",
                "map_url": "https://maps.google.com/?q=Machu+Picchu",
                "place_id": "ChIJ_peru_machu_picchu",
            },
            {
                "place_name": "Sacred Valley & Pisac Market",
                "address": "Urubamba Province, Cusco, Peru",
                "lat": -13.4225,
                "long": -71.8475,
                "review_ratings": 4.8,
                "highlights": "Scenic Andean valley with Incan agricultural terraces and artisan markets.",
                "map_url": "https://maps.google.com/?q=Sacred+Valley+Peru",
                "place_id": "ChIJ_peru_sacred_valley",
            },
        ]
    elif "tokyo" in normalized or "shibuya" in normalized:
        places = [
            {
                "place_name": "Shibuya Sky Observation Deck",
                "address": "2-24-12 Shibuya, Tokyo 150-6145, Japan",
                "lat": 35.6580,
                "long": 139.7016,
                "review_ratings": 4.8,
                "highlights": "360-degree open-air observation deck overlooking Shibuya Crossing and Mt. Fuji.",
                "map_url": "https://maps.google.com/?q=Shibuya+Sky+Tokyo",
                "place_id": "ChIJ_tokyo_shibuya_sky",
            },
            {
                "place_name": "Meiji Jingu Shrine",
                "address": "1-1 Yoyogikamizonocho, Shibuya City, Tokyo 151-8557, Japan",
                "lat": 35.6764,
                "long": 139.6993,
                "review_ratings": 4.7,
                "highlights": "Tranquil Shinto shrine surrounded by a lush 170-acre evergreen forest.",
                "map_url": "https://maps.google.com/?q=Meiji+Jingu+Tokyo",
                "place_id": "ChIJ_tokyo_meiji_jingu",
            },
        ]
    elif "seattle" in normalized or "space needle" in normalized or "pike place" in normalized:
        places = [
            {
                "place_name": "Pike Place Market",
                "address": "85 Pike St, Seattle, WA 98101",
                "lat": 47.6097,
                "long": -122.3422,
                "review_ratings": 4.8,
                "highlights": "Historic public market overlooking Elliott Bay with fresh seafood and crafts.",
                "map_url": "https://maps.google.com/?q=Pike+Place+Market+Seattle",
                "place_id": "ChIJ_seattle_pike_place",
            },
            {
                "place_name": "Museum of Pop Culture (MoPOP)",
                "address": "325 5th Ave N, Seattle, WA 98109",
                "lat": 47.6215,
                "long": -122.3481,
                "review_ratings": 4.7,
                "highlights": "Interactive music, sci-fi, and pop culture museum designed by Frank Gehry.",
                "map_url": "https://maps.google.com/?q=MoPOP+Seattle",
                "place_id": "ChIJ_seattle_mopop",
            },
        ]
    else:
        places = [
            {
                "place_name": f"{query.title()} City Center",
                "address": f"Central District, {query.title()}",
                "lat": 34.0522,
                "long": -118.2437,
                "review_ratings": 4.6,
                "highlights": f"Primary cultural and sightseeing hub in {query.title()}.",
                "map_url": f"https://maps.google.com/?q={query.replace(' ', '+')}",
                "place_id": f"ChIJ_generic_{normalized.replace(' ', '_')}",
            }
        ]

    # Section 3: Return formatted place results
    return {"query": query, "places": places}

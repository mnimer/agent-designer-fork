# Travel Concierge

This sample demonstrates the use of Google Agent Development Kit (ADK) to deliver a multi-agent travel concierge experience. A cohort of specialized agents collaborates to handle a traveler's end-to-end journey: from trip conception, destination discovery, flight/hotel planning, and booking payment processing, to pre-trip preparation, real-time in-trip monitoring/transit guidance, and post-trip preference extraction.

## Overview

A traveler's experience is divided into two primary stages: **pre-booking** and **post-booking**. Each stage involves specialized agents coordinated by the Root Travel Concierge agent (`root_agent`):

1. **Pre-Booking Stage**:
   - **Inspiration Agent (`inspiration_agent`)**: Suggests vacation destinations (`place_recommendation`) and points of interest/activities (`poi_suggestions`, `search_places` via Google Maps Grounding MCP).
   - **Planning Agent (`planning_agent`)**: Given a destination, dates, and preferences, searches flights (`flight_search`), selects seats (`flight_seat_selection`), searches hotels (`hotel_search`), selects rooms (`hotel_room_selection`), and synthesizes a structured JSON itinerary (`create_itinerary`).
   - **Booking Agent (`booking_agent`)**: Processes reservations (`create_reservation`), presents payment methods (`payment_choice`), and executes payment gateway transactions (`process_payment` supporting Google Pay, Credit Card, and Apple Pay simulation rules).

2. **Post-Booking Stage**:
   - **Pre-Trip Agent (`pre_trip_agent`)**: Invoked before departure to check visa requirements, medical requirements, storm updates, travel advisories (`google_search_grounding`), and generate customized packing lists (`what_to_pack`).
   - **In-Trip Agent (`in_trip_agent`)**: Invoked during the trip to monitor booking/flight/weather changes (`flight_status_check`, `event_booking_check`, `weather_impact_check`), provide real-time A-to-B transit directions (`transit_coordination`), and act as an interactive local guide.
   - **Post-Trip Agent (`post_trip_agent`)**: Collects post-trip feedback and extracts dietary, lodging, and activity preferences into persistent session memory (`memorize`) for future travel planning.

## Architecture & Model Configuration

| Feature | Specification |
| --- | --- |
| **Interaction Type** | Conversational & Multi-Turn State Machine |
| **Complexity** | Advanced Multi-Agent DAG |
| **Model** | `gemini-3.7-flash` on Vertex AI `global` region (`location="global"`) |
| **Memory** | ADK Session State (`memorize`, `memorize_list`, `forget`) |
| **Grounding** | Google Search Grounding (`bypass_multi_tools_limit=True`) & Google Maps Grounding MCP |

## Included Python Toolsets (`./tools/`)

* `memory_toolset.py`:
  * `memorize(key, value)`: Stores a key-value preference or state variable (e.g., `itinerary_datetime`, dietary preferences) in session state.
  * `memorize_list(key, value)`: Appends an item to a list in session state.
  * `forget(key, value)`: Removes an item from session state.
* `places_toolset.py`:
  * `search_places(query)`: Searches places and geocodes addresses/attractions returning coordinates, ratings, and Google Maps links.
* `planning_toolset.py`:
  * `place_recommendation(query)`: Suggests vacation destinations matching user interests.
  * `poi_suggestions(destination)`: Returns top points of interest and activities for a destination.
  * `flight_search(origin, destination, departure_date, return_date)`: Searches available flights and fares.
  * `flight_seat_selection(flight_number, seat_preference)`: Selects available cabin seats.
  * `hotel_search(destination, check_in_date, check_out_date)`: Searches hotels near target area.
  * `hotel_room_selection(hotel_name, room_type)`: Selects hotel room options.
  * `create_itinerary(trip_name, origin, destination, start_date, end_date)`: Generates a structured multi-day itinerary JSON.
  * `what_to_pack(origin, destination, activities)`: Generates a tailored packing list.
* `booking_toolset.py`:
  * `create_reservation(item_type, item_description, price)`: Creates a reservation ID for flights, hotels, or tours.
  * `payment_choice()`: Lists available payment methods (Apple Pay, Google Pay, Credit Card).
  * `process_payment(reservation_id, payment_method, amount)`: Executes simulated payment processing (approves Google Pay & Credit Card; declines Apple Pay per sample rules).
* `intrip_toolset.py`:
  * `flight_status_check(flight_number, flight_date)`: Checks flight delays, gate changes, or cancellations.
  * `event_booking_check(event_name, event_date, event_location)`: Verifies venue operating status and ticket validity.
  * `weather_impact_check(activity_name, activity_date, activity_location)`: Evaluates weather forecasts against outdoor itinerary events.
  * `transit_coordination(origin, destination, current_datetime)`: Provides real-time A-to-B transit logistics and timing.

## Test Suite Scenarios (13 Automated Evaluation Cases)

The attached Test Suite node (`triggerType: 'tester'`) includes 13 comprehensive test cases derived from the ADK evaluation datasets (`inspire.test.json`, `pretrip.test.json`, `intrip.test.json`) and end-to-end travel workflows:

1. **Americas Destination Inspiration**: `"Inspire me about the Americas"`
2. **Peru Activities & POIs**: `"Tell me more what I can do in Peru"`
3. **Transition to Peru Planning**: `"Start planning a trip to Peru"`
4. **Tokyo 4-Day Boutique Hotel Planning**: `"Plan a 4-day trip to Tokyo for 2 adults departing next Friday with a boutique hotel near Shibuya."`
5. **Booking Confirmation & Payment Choices**: `"I am ready to book my flights and hotel for Tokyo. Show me my payment choices."`
6. **Payment Processing - Apple Pay Decline Rule**: `"Confirm my flight and hotel reservations and pay using Apple Pay"`
7. **Payment Processing - Google Pay Approval**: `"Process payment for my confirmed reservation using Google Pay"`
8. **Pre-Trip Phase Activation**: `"transfer to pre_trip"`
9. **Pre-Trip Comprehensive Update (Visa, Medical, Weather, Packing)**: `"update"`
10. **In-Trip Phase Activation**: `"transfer to in_trip"`
11. **In-Trip Daily Booking & Weather Monitor**: `"monitor"`
12. **In-Trip Session Datetime Memorization**: `"memorize the date '2025-06-16 12:45:00' and store it in the variable 'itinerary_datetime'"`
13. **In-Trip Day-Of Transit Assistance**: `"call day_of for transport help"`

"""
Travel Concierge Booking & Payment Toolset

Purpose:
Provides reservation creation, payment method presentation, and payment gateway simulation
tools for the Booking Agent (`booking_agent`).

Architectural Decisions:
- Author: Mike Nimer <mikenimer@google.com>
- Implements the exact simulation scenario rules from the ADK sample (`PROCESS_PAYMENT_INSTR`):
  - Apple Pay is declined to test payment fallback handling.
  - Google Pay and Credit Card on file are approved and return a confirmed order ID.
"""

import uuid
from typing import Any, Dict, List


def create_reservation(
    item_type: str,
    item_description: str,
    price_usd: float = 0.0,
) -> Dict[str, Any]:
    """
    Creates a reservation hold for a bookable flight, hotel, or tour item and generates a
    unique reservation ID.

    Args:
        item_type: Category of item ('flight', 'hotel', 'tour', 'event').
        item_description: Detailed name or summary of the item being reserved.
        price_usd: Total price in USD requiring payment.

    Returns:
        Dictionary containing reservation_id, price, and pending payment status.
    """
    # Section 1: Generate unique reservation identifier
    reservation_id = f"RES-{uuid.uuid4().hex[:8].upper()}"

    # Section 2: Return structured reservation payload
    return {
        "reservation_id": reservation_id,
        "item_type": item_type,
        "item_description": item_description,
        "price_usd": price_usd,
        "status": "RESERVATION_CREATED_AWAITING_PAYMENT",
        "message": f"Reservation {reservation_id} created for {item_description}. Please select a payment method to complete booking.",
    }


def payment_choice() -> Dict[str, Any]:
    """
    Presents the user with available payment methods on file.

    Returns:
        Dictionary listing supported payment options.
    """
    # Section 1: Define available payment options matching ADK sample specification
    methods: List[str] = [
        "1. Apple Pay",
        "2. Google Pay",
        "3. Credit Card on file",
    ]

    # Section 2: Return structured choices
    return {
        "available_payment_methods": methods,
        "prompt": "Please choose one of the available payment methods: Apple Pay, Google Pay, or Credit Card on file.",
    }


def process_payment(
    reservation_id: str,
    payment_method: str,
    amount_usd: float = 0.0,
) -> Dict[str, Any]:
    """
    Executes payment gateway processing for a reserved item based on the chosen payment method.

    Args:
        reservation_id: Reservation ID returned by `create_reservation`.
        payment_method: Selected payment method ('Apple Pay', 'Google Pay', or 'Credit Card').
        amount_usd: Transaction total in USD.

    Returns:
        Transaction result dictionary with approval/decline status and order_id.
    """
    # Section 1: Normalize payment method string
    method_norm = payment_method.lower().strip()

    # Section 2: Apply ADK simulation rules (Apple Pay declines; Google Pay & Credit Card approve)
    if "apple" in method_norm:
        return {
            "reservation_id": reservation_id,
            "payment_method": payment_method,
            "status": "DECLINED",
            "error_code": "GATEWAY_APPLE_PAY_UNSUPPORTED",
            "message": "Transaction declined: Apple Pay is currently unavailable on this gateway. Please select Google Pay or Credit Card on file.",
        }

    # Section 3: Approve Google Pay and Credit Card transactions
    order_id = f"ORD-{uuid.uuid4().hex[:10].upper()}"
    return {
        "reservation_id": reservation_id,
        "order_id": order_id,
        "payment_method": payment_method,
        "amount_usd": amount_usd,
        "status": "APPROVED_AND_CONFIRMED",
        "message": f"Payment approved via {payment_method}. Booking confirmed under Order ID {order_id}.",
    }

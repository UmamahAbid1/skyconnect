const express = require('express');
const router = express.Router();
const db = require('./db');

// 1. Login Route
router.post('/login', (req, res) => {
  const { email } = req.body;
  db.query('SELECT * FROM Users WHERE Email = ?', [email], (err, result) => {
    if (err) return res.status(500).json({ error: err });
    if (result.length === 0) return res.status(401).json({ message: "User not found" });
    res.json(result[0]);
  });
});

// 2. Get all Flights (Public)
router.get('/flights', (req, res) => {
  db.query('SELECT * FROM Flights', (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});
// 3. Book a Flight
router.post('/book', (req, res) => {
  const { userId, flightId } = req.body;

  const seatQuery = `
    SELECT SeatID FROM Seats 
    WHERE FlightID = ? AND Status_of_flight = 'Available' 
    LIMIT 1
  `;

  db.query(seatQuery, [flightId], (err, seatResult) => {
    if (err) {
      console.error("Seat query error:", err);
      return res.status(500).json({ message: "Database error (seat lookup)", error: err });
    }

    if (seatResult.length === 0) {
      return res.status(400).json({ message: "No seats available" });
    }

    const seatId = seatResult[0].SeatID;
    const seatNo = `Seat${seatId}`;

    db.query(
      `INSERT INTO Bookings (UserID, FlightID, SeatNo, Status_of_flight) VALUES (?, ?, ?, ?)`,
      [userId, flightId, seatNo, 'Booked'],
      (err, result) => {
        if (err) {
          console.error("Booking insert error:", err);
          return res.status(500).json({ message: "Database error (insert booking)", error: err });
        }

        db.query(
          `UPDATE Seats SET Status_of_flight = 'Booked' WHERE SeatID = ?`,
          [seatId],
          (updateErr) => {
            if (updateErr) {
              console.error("Seat update error:", updateErr);
              return res.status(500).json({ message: "Failed to update seat status", error: updateErr });
            }

            res.json({
              message: "Flight booked successfully",
              seat: seatNo
            });
          }
        );
      }
    );
  });
});


// ✅ Get bookings for a user
router.get('/bookings/:userId', (req, res) => {
  const userId = req.params.userId;

  db.query(
    `SELECT b.BookingID, f.Airline, f.Source1, f.Destination, f.Departure, b.SeatNo
     FROM Bookings b
     JOIN Flights f ON b.FlightID = f.FlightID
     WHERE b.UserID = ?`,
    [userId],
    (err, result) => {
      if (err) {
        console.error("Bookings fetch error:", err);
        return res.status(500).json({ message: "Failed to fetch bookings", error: err });
      }

      res.json(result);
    }
  );
});


// Submit Review
router.post('/reviews', (req, res) => {
  const { userId, flightId, rating, comments } = req.body;
  db.query(
    'INSERT INTO Reviews (UserID, FlightID, Rating, Comments) VALUES (?, ?, ?, ?)',
    [userId, flightId, rating, comments],
    (err, result) => {
      if (err) return res.status(500).send(err);
      res.json({ message: "Review submitted successfully!" });
    }
  );
});

router.get('/reviews/:flightId', (req, res) => {
  const flightId = req.params.flightId;
  db.query(`
    SELECT u.username, r.Rating, r.Comments
    FROM Reviews r
    JOIN Users u ON r.UserID = u.UserID
    WHERE r.FlightID = ?
  `, [flightId], (err, results) => {
    if (err) return res.status(500).send(err);
    res.json(results);
  });
});
// Add seats to all flights
router.post('/seats/add-all', (req, res) => {
  const { seatsPerFlight, seatType } = req.body;

  if (!seatsPerFlight || !seatType) {
    return res.status(400).json({ message: "Missing seatsPerFlight or seatType" });
  }

  db.query('SELECT FlightID FROM Flights', (err, flights) => {
    if (err) {
      console.error("Error fetching flights:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const allSeats = [];

    flights.forEach(flight => {
      for (let i = 0; i < seatsPerFlight; i++) {
        allSeats.push([flight.FlightID, seatType, 'Available']);
      }
    });

    db.query(
      'INSERT INTO Seats (FlightID, SeatType, Status_of_flight) VALUES ?',
      [allSeats],
      (insertErr, result) => {
        if (insertErr) {
          console.error("Error inserting seats:", insertErr);
          return res.status(500).json({ message: "Failed to insert seats", error: insertErr });
        }

        res.json({
          message: `✅ ${seatsPerFlight} seats added to ${flights.length} flights`,
          totalSeats: result.affectedRows
        });
      }
    );
  });
});
// Cancel booking and restore seat availability
router.post('/cancel-booking', (req, res) => {
  const { bookingId } = req.body;

  if (!bookingId) {
    return res.status(400).json({ message: "Booking ID required" });
  }

  // Step 1: Get SeatNo and FlightID for that booking
  db.query(
    `SELECT SeatNo, FlightID FROM Bookings WHERE BookingID = ?`,
    [bookingId],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Error retrieving booking", error: err });
      if (result.length === 0) return res.status(404).json({ message: "Booking not found" });

      const { SeatNo, FlightID } = result[0];

      // Step 2: Cancel the booking
      db.query(
        `UPDATE Bookings SET Status_of_flight = 'Cancelled' WHERE BookingID = ?`,
        [bookingId],
        (cancelErr, cancelResult) => {
          if (cancelErr) return res.status(500).json({ message: "Error cancelling booking", error: cancelErr });

          const seatId = SeatNo.startsWith("Seat") ? parseInt(SeatNo.replace("Seat", "")) : null;

          if (seatId) {
            db.query(`UPDATE Seats SET Status_of_flight = 'Available' WHERE FlightID = ? AND SeatID = ?`,
              [FlightID, seatId],
              (seatErr) => {
                if (seatErr) console.error("Seat restore failed:", seatErr);
              });
          }

          // Step 3: Insert cancellation record with refund
          const refundAmount = 150.00; // You can change or calculate dynamically
          db.query(
            `INSERT INTO Cancellation (BookingID, RefundAmount, Status_of_flight) VALUES (?, ?, 'Cancelled')`,
            [bookingId, refundAmount],
            (cancelLogErr) => {
              if (cancelLogErr) {
                return res.status(500).json({ message: "Cancelled but failed to log in cancellation table", error: cancelLogErr });
              }

              return res.json({ message: "Booking cancelled and recorded successfully" });
            }
          );
        }
      );
    }
  );
});


// POST /api/create-flight
router.post('/create-flight', (req, res) => {
  const {
    Airline, Source1, Destination,
    Departure, Arrival, Status_of_flight,
    seatsToAdd = 70,
    seatType = "Economy"
  } = req.body;

  const sql = `
    INSERT INTO Flights (Airline, Source1, Destination, Departure, Arrival, Status_of_flight)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  db.query(sql, [Airline, Source1, Destination, Departure, Arrival, Status_of_flight], (err, result) => {
    if (err) return res.status(500).json({ message: "Flight insert failed", error: err });

    const flightId = result.insertId;
    const seatRows = Array.from({ length: seatsToAdd }).map(() => [flightId, seatType, 'Available']);
    db.query(`INSERT INTO Seats (FlightID, SeatType, Status_of_flight) VALUES ?`, [seatRows], (err2) => {
      if (err2) {
        return res.status(500).json({ message: "Flight added but seat insert failed", flightId });
      }
      res.json({ message: `✅ ${seatsToAdd} seats added to Flight ${flightId}`, totalSeats: seatRows.length });
    });
  });
});



module.exports = router;

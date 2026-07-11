const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // serve frontend

// 🔗 MySQL connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '12345678',
    database: 'hospital_db'
});

db.connect(err => {
    if (err) console.error(err);
    else console.log("Connected to MySQL");
});


// ===================== PATIENT =====================

// GET all patients
app.get('/patients', (req, res) => {
    db.query('SELECT * FROM patient', (err, result) => {
        if (err) throw err;
        res.send(result);
    });
});

// ADD patient
app.post('/patients', (req, res) => {
    const { name, age, gender } = req.body;

    db.query(
        'INSERT INTO patient (name, age, gender) VALUES (?, ?, ?)',
        [name, age, gender],
        (err) => {
            if (err) throw err;
            res.send("Patient added");
        }
    );
});

// DELETE patient
app.delete('/patients/:id', (req, res) => {
    db.query(
        'DELETE FROM patient WHERE patient_id=?',
        [req.params.id],
        (err) => {
            if (err) throw err;
            res.send("Patient deleted");
        }
    );
});


// ===================== DOCTORS =====================

app.get('/doctors', (req, res) => {
    db.query("SELECT * FROM doctor", (err, result) => {
        if (err) {
            console.error(err);
            return res.send([]);
        }
        res.send(result);
    });
});

// ===================== ROOMS =====================

app.get('/rooms', (req, res) => {
    db.query('SELECT * FROM room', (err, result) => {
        if (err) throw err;
        res.send(result);
    });
});


// ===================== BLOOD BANK =====================

app.get('/blood', (req, res) => {
    db.query('SELECT * FROM blood_bank', (err, result) => {
        if (err) throw err;
        res.send(result);
    });
});


// ===================== BILLING (extra marks) =====================

app.get('/billing', (req, res) => {
    db.query('SELECT * FROM billing', (err, result) => {
        if (err) throw err;
        res.send(result);
    });
});

app.post('/billing', (req, res) => {
    const { patient_id, total_amount, payment_status } = req.body;

    db.query(
        'INSERT INTO billing (patient_id, total_amount, payment_status) VALUES (?, ?, ?)',
        [patient_id, total_amount, payment_status],
        (err) => {
            if (err) throw err;
            res.send("Bill added");
        }
    );
});
// Assign room
app.post('/assign-room', (req, res) => {
    const { patient_id, room_id } = req.body;

    db.query(
        'INSERT INTO admission (patient_id, room_id, admit_date) VALUES (?, ?, CURDATE())',
        [patient_id, room_id],
        () => res.send("Room assigned")
    );
});
app.put('/discharge/:id', (req, res) => {
    const id = req.params.id;

    // Step 1: get room_id
    db.query(
        "SELECT room_id FROM admission WHERE admission_id = ?",
        [id],
        (err, result) => {

            if (err) {
                console.error(err);
                return res.send("Error fetching admission");
            }

            if (!result || result.length === 0) {
                return res.send("Invalid admission ID");
            }

            const room_id = result[0].room_id;

            // Step 2: update discharge date
            db.query(
                "UPDATE admission SET discharge_date = CURDATE() WHERE admission_id = ?",
                [id],
                (err2) => {

                    if (err2) {
                        console.error(err2);
                        return res.send("Error updating discharge");
                    }

                    // Step 3: make room available
                    db.query(
                        "UPDATE room SET availability = 1 WHERE room_id = ?",
                        [room_id],
                        (err3) => {

                            if (err3) {
                                console.error(err3);
                                return res.send("Error updating room");
                            }

                            res.send("Patient discharged & room available");
                        }
                    );
                }
            );
        }
    );
});
app.post('/blood-request', (req, res) => {
    const { patient_id, blood_group, units } = req.body;

    db.query(
        'INSERT INTO blood_request (patient_id, blood_group, units) VALUES (?, ?, ?)',
        [patient_id, blood_group, units],
        () => res.send("Blood assigned")
    );
});


// ===================== BILLING SYSTEM =====================

app.post('/generate-bill', (req, res) => {
    const { admission_id } = req.body;

    db.query(
        `SELECT a.patient_id,
                DATEDIFF(IFNULL(a.discharge_date, CURDATE()), a.admit_date) AS days,
                r.room_type,
                r.charge_per_day
         FROM admission a
         JOIN room r ON a.room_id = r.room_id
         WHERE a.admission_id = ?`,
        [admission_id],
        (err, result) => {

            if (err) {
                console.error(err);
                return res.send({ error: "Database error" });
            }

            if (!result || result.length === 0) {
                return res.send({ error: "Invalid admission ID" });
            }

            const data = result[0];

            const days = data.days || 1;

            // ✅ Use room charge from DB
            const room_charges = days * data.charge_per_day;

            // ✅ Auto logic based on room type
            let doctor_fee = 0;
            let medicine_cost = 0;

            if (data.room_type === "General") {
                doctor_fee = 200;
                medicine_cost = 300;
            } 
            else if (data.room_type === "Deluxe") {
                doctor_fee = 500;
                medicine_cost = 800;
            } 
            else if (data.room_type === "ICU") {
                doctor_fee = 1000;
                medicine_cost = 1500;
            }

            const total = room_charges + doctor_fee + medicine_cost;

            // Insert bill
            db.query(
                `INSERT INTO billing 
                (patient_id, admission_id, room_charges, doctor_fee, medicine_cost, blood_cost, total_amount, bill_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE())`,
                [
                    data.patient_id,
                    admission_id,
                    room_charges,
                    doctor_fee,
                    medicine_cost,
                    0,
                    total
                ],
                () => {
                    res.send({
                        patient_id: data.patient_id,
                        room_type: data.room_type,
                        days,
                        room_charges,
                        doctor_fee,
                        medicine_cost,
                        total
                    });
                }
            );
        }
    );
});

app.get('/billing', (req, res) => {
    db.query('SELECT * FROM billing', (err, result) => {
        res.send(result);
    });
});
// ================= LOGIN =================


app.post('/query', (req, res) => {
    const { query } = req.body;

    db.query(query, (err, result) => {
        if (err) {
            res.send({ error: err.message });
        } else {
            res.send(result);
        }
    });
});
// ================= DOCTOR-PATIENT MAPPING =================

// Assign doctor to patient
app.post('/assign-doctor', (req, res) => {
    const { doctor_id, patient_id } = req.body;

    db.query(
        'INSERT INTO doctor_patient (doctor_id, patient_id) VALUES (?, ?)',
        [doctor_id, patient_id],
        (err) => {
            if (err) throw err;
            res.send("Doctor assigned to patient");
        }
    );
});

// Get all mappings
app.get('/doctor-patient', (req, res) => {
    db.query(
        `SELECT dp.id, p.name AS patient, d.name AS doctor
         FROM doctor_patient dp
         JOIN patient p ON dp.patient_id = p.patient_id
         JOIN doctor d ON dp.doctor_id = d.doctor_id`,
        (err, result) => {
            if (err) throw err;
            res.send(result);
        }
    );
});
const multer = require('multer');
const upload = multer();

app.post('/upload', upload.single('image'), (req, res) => {
    const { patient_id } = req.body;
    const image = req.file.buffer;

    db.query(
        'UPDATE patient SET image=? WHERE patient_id=?',
        [image, patient_id],
        () => res.send("Image uploaded")
    );
});
app.get('/patients/:id', (req, res) => {
    const id = req.params.id;

    db.query(
        `SELECT p.*, a.room_id
         FROM patient p
         LEFT JOIN admission a ON p.patient_id = a.patient_id
         WHERE p.patient_id = ?`,
        [id],
        (err, result) => {
            if (err) throw err;
            res.send(result[0]);
        }
    );
});
app.get('/doctor/:id', (req, res) => {
    const id = req.params.id;

    db.query(
        `SELECT d.name, d.specialization, p.name AS patient_name
         FROM doctor d
         LEFT JOIN admission a ON d.doctor_id = a.doctor_id
         LEFT JOIN patient p ON a.patient_id = p.patient_id
         WHERE d.doctor_id = ?`,
        [id],
        (err, result) => {

            const doctor = {
                name: result[0]?.name,
                specialization: result[0]?.specialization,
                patients: result.map(r => ({ name: r.patient_name }))
            };

            res.send(doctor);
        }
    );
});
app.get('/doctors.html', (req, res) => {
    res.sendFile(__dirname + '/public/doctors.html');
});
app.get('/stats', (req, res) => {
    db.query(
        `SELECT d.name, COUNT(a.patient_id) AS count
         FROM doctor d
         LEFT JOIN admission a ON d.doctor_id = a.doctor_id
         GROUP BY d.name`,
        (err, result) => {
            if (err) return res.send([]);
            res.send(result);
        }
    );
});
app.get('/counts', (req, res) => {
    db.query(`
        SELECT 
        (SELECT COUNT(*) FROM patient) AS patients,
        (SELECT COUNT(*) FROM doctor) AS doctors,
        (SELECT COUNT(*) FROM room WHERE availability = 1) AS rooms
    `, (err, result) => {
        res.send(result[0]);
    });
});
app.get('/room-stats', (req, res) => {
    db.query(`
        SELECT availability, COUNT(*) AS count
        FROM room
        GROUP BY availability
    `, (err, result) => {
        res.send(result);
    });
});
app.post('/book-appointment', (req, res) => {
    const { patient_id, doctor_id, date, time } = req.body;

    db.query(
        "INSERT INTO appointment (patient_id, doctor_id, appointment_date, appointment_time) VALUES (?, ?, ?, ?)",
        [patient_id, doctor_id, date, time],
        (err) => {
            if (err) return res.send({ error: err });
            res.send({ message: "Appointment booked!" });
        }
    );
});
app.get('/patient-history/:id', (req, res) => {
    const id = req.params.id;

    db.query(`
        SELECT 'Admitted' AS event, admit_date AS date FROM admission WHERE patient_id = ?
        UNION
        SELECT 'Discharged', discharge_date FROM admission WHERE patient_id = ?
        UNION
        SELECT 'Appointment', appointment_date FROM appointment WHERE patient_id = ?
        ORDER BY date
    `, [id, id, id], (err, result) => {
        res.send(result);
    });
});
app.get('/appointments', (req, res) => {
    db.query("SELECT * FROM appointment", (err, result) => {
        res.send(result);
    });
});
app.post('/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    // ADMIN
    if (username === "admin" && password === "admin123") {
        return res.json({ role: "admin" });
    }

    // DOCTOR
    db.query(
        "SELECT * FROM doctor WHERE username=? AND password=?",
        [username, password],
        (err, result) => {

            if (result && result.length > 0) {
                return res.json({
                    role: "doctor",
                    doctor_id: result[0].doctor_id
                });
            }

            res.json({ error: "Invalid login" });
        }
    );
});
// ===================== SERVER =====================

app.listen(3000, () => {
    console.log("Server running on port 3000");
});


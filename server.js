require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const qr = require("qr-image");
const { Pool } = require("pg");
const fs = require("fs");

const app = express();
const upload = multer({ dest: "uploads/" });

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: process.env.DB_PORT,
});

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Home Page - Show QR Codes
app.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM qr_codes ORDER BY id DESC");
        res.render("index", { qrCodes: result.rows });
    } catch (err) {
        console.error(err);
        res.send("Error loading QR codes.");
    }
});

// Handle QR Code Generation
app.post("/generate-qr", async (req, res) => {
    const { link } = req.body;

    if (!link) return res.send("Please provide a valid link.");

    try {
        // Store in PostgreSQL and get the inserted ID
        const result = await pool.query(
            "INSERT INTO qr_codes (link, qr_image_url, scan_count) VALUES ($1, '', 0) RETURNING id",
            [link]
        );
        const qrId = result.rows[0].id;

        // Generate QR Code with /scan/:id link
        const qrScanUrl = `http://https://qr-code-8una.onrender.com//scan/${qrId}`; // Replace with your actual domain
        const qrCodeImage = qr.imageSync(qrScanUrl, { type: "png" });
        const qrFilePath = `uploads/${Date.now()}.png`;
        fs.writeFileSync(qrFilePath, qrCodeImage);

        // Upload to Cloudinary
        const cloudinaryResponse = await cloudinary.uploader.upload(qrFilePath);
        const qrImageUrl = cloudinaryResponse.secure_url;

        // Update QR Image URL in the database
        await pool.query("UPDATE qr_codes SET qr_image_url = $1 WHERE id = $2", [qrImageUrl, qrId]);

        // Cleanup local file
        fs.unlinkSync(qrFilePath);

        res.redirect("/");
    } catch (err) {
        console.error(err);
        res.send("Error generating QR code.");
    }
});






app.get("/scan/:id", async (req, res) => {
    try {
        console.log(`📌 Scan request received for ID: ${req.params.id}`);

        const { id } = req.params;
        const result = await pool.query("SELECT * FROM qr_codes WHERE id = $1", [id]);

        if (result.rows.length === 0) {
            console.log("❌ QR Code not found.");
            return res.status(404).send("QR Code not found.");
        }

        const qrCode = result.rows[0];

        // Update scan count
        await pool.query("UPDATE qr_codes SET scan_count = scan_count + 1 WHERE id = $1", [id]);
        console.log(`✅ Scan count updated for ID: ${id}`);

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");

        res.redirect(qrCode.link);
    } catch (error) {
        console.error("❌ Error processing scan:", error);
        res.status(500).send("Server error.");
    }
});



// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

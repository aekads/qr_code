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
        const result = await pool.query(
            "INSERT INTO qr_codes (link, qr_image_url, scan_count) VALUES ($1, '', 0) RETURNING id",
            [link]
        );
        const qrId = result.rows[0].id;

        // Generate QR Code with /scan/:id link
        const qrScanUrl = `http://https://qr.aekads.com/scan/${qrId}`;
        console.log(`✅ QR Code will point to: ${qrScanUrl}`);

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







// app.get("/scan/:id", async (req, res) => {
//     try {
//         console.log(`📌 Scan request received for ID: ${req.params.id}`);

//         const { id } = req.params;
        
//         // Debugging: Check if ID is actually a number
//         if (isNaN(id)) {
//             console.log("❌ Invalid ID format.");
//             return res.status(400).send("Invalid QR Code ID.");
//         }

//         const result = await pool.query("SELECT * FROM qr_codes WHERE id = $1", [id]);

//         if (result.rows.length === 0) {
//             console.log("❌ QR Code not found in database.");
//             return res.status(404).send("QR Code not found.");
//         }

//         const qrCode = result.rows[0];

//         // Update scan count
//         await pool.query("UPDATE qr_codes SET scan_count = scan_count + 1 WHERE id = $1", [id]);
//         console.log(`✅ Scan count updated for ID: ${id}`);

//         res.redirect(qrCode.link);
//     } catch (error) {
//         console.error("❌ Error processing scan:", error);
//         res.status(500).send("Server error.");
//     }
// });




app.get("/scan/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query("SELECT * FROM qr_codes WHERE id = $1", [id]);

        if (result.rows.length === 0) {
            return res.status(404).send("QR Code not found.");
        }

        const qrCode = result.rows[0];

        // Update scan count
        await pool.query("UPDATE qr_codes SET scan_count = scan_count + 1 WHERE id = $1", [id]);

        res.send(`
            <html>
            <head>
                <script>
                    function openInChrome() {
                        var url = "${qrCode.link}";
        
                        // Check if Chrome is available (iOS scheme)
                        var chromeURL = url.replace(/^https?:\/\//, "googlechrome://");
        
                        // Open in Chrome
                        window.location.href = chromeURL;
        
                        // Fallback: If Chrome is not installed, open in the default browser after 1 second
                        setTimeout(() => {
                            window.location.href = url;
                        }, 1000);
                    }
        
                    // Auto-execute on page load
                    openInChrome();
                </script>
            </head>
            <body>
                <p>Redirecting to Chrome... If nothing happens, <a href="googlechrome://${qrCode.link.replace(/^https?:\/\//, '')}">click here</a>.</p>
            </body>
            </html>
        `);
        

    } catch (error) {
        console.error("❌ Error processing scan:", error);
        res.status(500).send("Server error.");
    }
});




// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

import express from "express";
import axios from "axios";
import { Country, City } from "country-state-city";
import redisClient from "./redisClient.js";
import pool from "./db.js"; // ✅ Import db connection
import OpenAI from "openai";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const app = express();

// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());

const PORT = process.env.PORT || 3001;
const VERIFY_TOKEN = "VERIFY_TOKEN";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SENDER_EMAIL,
    pass: process.env.SENDER_PASSWORD,
  },
});

async function validateWithOpenAI(userInput, currentStep, sessionData = {}) {
  try {
    const systemPrompt = `You are a validation assistant for Meraki Sports registration flow. The user goes through these steps:
1. ASK_NAME: User provides their name
2. ASK_EMAIL: User provides their email address  
3. ASK_CITY: User provides their city (must be in India)
4. ASK_CODE: User provides a stratch code

Current step: ${currentStep}
Session data: ${JSON.stringify(sessionData)}

IMPORTANT: Users may provide information in conversational format or complete sentences. You must intelligently EXTRACT the relevant information from their text.

Examples:
- "here's my email: aditya.sakpal2081@gmail.com" → extract "aditya.sakpal2081@gmail.com"
- "My nameis John Smith" → extract "John Smith"
- "I live in Mumbai, India" → extract "Mumbai"
- "The code is ABC123" → extract "ABC123"

For each validation, return a JSON response with:
{
  "message": "success/error message with next step if valid",
  "is_valid": true/false,
  "value": "extracted_clean_value_or_empty_string"
}

Validation rules:
- NAME: Minimum 2 characters, no numbers or special characters except spaces, hyphens, apostrophes. Extract the actual namefrom conversational text.
- EMAIL: Valid email format ONLY. Extract email address from any text that contains it. Do NOT check if email exists or is already registered.
- CITY: Must be a city in India. Extract city namefrom conversational text, even if mentioned with state/country.
- CODE: Must be exactly 6 characters, alphanumeric combination of letters and numbers. Extract the code from conversational text. Do NOT check if code exists in database.

If valid:
- message: Energetic message + what's needed next (except for code validation)
- is_valid: true
- value: cleaned/extracted value (ONLY the relevant data, not the full sentence)

If invalid:
- message: Explain why invalid + ask for correct input
- is_valid: false  
- value: ""`;

    const userPrompt = `Current step: ${currentStep}
User input: "${userInput}"

Validate this input according to the current step requirements.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const result = JSON.parse(completion.choices[0].message.content);
    console.log(`OpenAI validation result for ${currentStep}:`, result);
    return result;
  } catch (error) {
    console.error("OpenAI validation error:", error);
    return {
      message:
        "Sorry, I'm having trouble processing your input. Please try again.",
      is_valid: false,
      value: "",
    };
  }
}

// Legacy validation functions (kept as fallback)
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateCity(input) {
  const normalized = input.trim().toLowerCase();
  return City.getCitiesOfCountry("IN").some(
    (c) => c.name.toLowerCase() === normalized,
  );
}

async function sendText(to, body) {
  await axios.post(
    `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    },
  );
}

async function updateCodeInDatabase({ phone, name, email, city, code }) {
  try {
    console.log("Updating code in DB:", { phone, name, email, city, code });

    // Update the codes table with user details and mark as inactive
    const result = await pool.query(
      `UPDATE codes 
       SET phone_number = $1, "name" = $2, email = $3, city = $4, status = 'inactive', created_at = NOW()
       WHERE code = $5 AND status = 'active'
       RETURNING *`,
      [phone, name, email, city, code],
    );

    if (result.rows.length > 0) {
      console.log("Code successfully updated:", result.rows[0]);
      return true;
    } else {
      console.log("No active code found to update");
      return false;
    }
  } catch (err) {
    console.error("Database update error:", err.message);
    throw err;
  }
}

// API endpoint to get statistics
app.get("/api/stats", async (req, res) => {
  try {
    // Get total registrations (inactive codes)
    const totalRegistrationsResult = await pool.query(
      "SELECT COUNT(*) as total FROM codes WHERE status = 'inactive'",
    );
    const totalRegistrations = parseInt(totalRegistrationsResult.rows[0].total);

    // Get the date range for calculating scans per day
    const dateRangeResult = await pool.query(
      `SELECT 
        MIN(created_at) as first_registration,
        MAX(created_at) as last_registration
       FROM codes 
       WHERE status = 'inactive' AND created_at IS NOT NULL`,
    );

    let codeScansPerDay = 0;
    if (
      dateRangeResult.rows[0].first_registration &&
      dateRangeResult.rows[0].last_registration
    ) {
      const firstDate = new Date(dateRangeResult.rows[0].first_registration);
      const lastDate = new Date(dateRangeResult.rows[0].last_registration);

      // Calculate difference in days
      const timeDifference = lastDate.getTime() - firstDate.getTime();
      const daysDifference =
        Math.ceil(timeDifference / (1000 * 3600 * 24)) || 1; // At least 1 day

      codeScansPerDay = Math.round(totalRegistrations / daysDifference);
    }

    // Get winners from database
    const winnersResult = await pool.query(
      `SELECT "name" as name, phone_number as phone, city
       FROM codes 
       WHERE status = 'inactive' AND is_winner = true
       ORDER BY created_at DESC`,
    );
    console.log("winnersResult", winnersResult);
    const winnersSelected = winnersResult.rows.map((row) => ({
      name: row.name? row.name.trim() : "N/A",
      phone: row.phone || "N/A",
      city: row.city || "N/A",
    }));

    res.json({
      registrations: totalRegistrations,
      codeScansPerDay: codeScansPerDay,
      winnersSelected: winnersSelected,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

// API endpoint to get chart data
app.get("/api/charts", async (req, res) => {
  try {
    // Get daily registrations data
    const dailyRegistrationsResult = await pool.query(
      `SELECT 
        DATE(created_at) as registration_date,
        COUNT(*) as count
       FROM codes 
       WHERE status = 'inactive' AND created_at IS NOT NULL
       GROUP BY DATE(created_at)
       ORDER BY registration_date ASC`,
    );

    // Format daily data for chart (MM-DD format)
    const daily = dailyRegistrationsResult.rows.map((row) => ({
      date: new Date(row.registration_date).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
      }),
      count: parseInt(row.count),
    }));

    // Get city-wise participation data
    const cityRegistrationsResult = await pool.query(
      `SELECT 
        city,
        COUNT(*) as value
       FROM codes 
       WHERE status = 'inactive' AND city IS NOT NULL AND city != ''
       GROUP BY city
       ORDER BY value DESC`,
    );

    // Format city data for pie chart
    const city = cityRegistrationsResult.rows.map((row) => ({
      name: row.city,
      value: parseInt(row.value),
    }));

    // Get total registrations for contest performance
    const totalRegistrationsResult = await pool.query(
      "SELECT COUNT(*) as total FROM codes WHERE status = 'inactive'",
    );
    const totalRegistrations = parseInt(totalRegistrationsResult.rows[0].total);

    // Contest performance data (single bar for Maidan 72)
    const performance = [{ contest: "Maidan 72", value: totalRegistrations }];

    res.json({
      daily,
      city,
      performance,
    });
  } catch (error) {
    console.error("Error fetching chart data:", error);
    res.status(500).json({ error: "Failed to fetch chart data" });
  }
});

// API endpoint to get recent activity data
app.get("/api/recent-activity", async (req, res) => {
  try {
    // Get all inactive codes with user details, ordered by most recent first
    const recentActivityResult = await pool.query(
      `SELECT 
        code_id as id,
        "name" as name,
        phone_number as phone,
        city,
        email,
        code,
        created_at,
        is_winner,
        DATE(created_at) as date
       FROM codes 
       WHERE status = 'inactive' 
         AND "name" IS NOT NULL 
         AND phone_number IS NOT NULL 
         AND city IS NOT NULL
         AND created_at IS NOT NULL
       ORDER BY created_at DESC`,
    );

    // Format data for the table
    const entries = recentActivityResult.rows.map((row) => ({
      id: row.id,
      name: row.name? row.name.trim() : "N/A", // Trim whitespace from name
      phone: row.phone || "N/A",
      city: row.city || "N/A",
      status: "Registered", // All inactive codes are considered registered
      date: row.date ? new Date(row.date).toISOString().slice(0, 10) : "N/A", // Format as YYYY-MM-DD
      email: row.email || "N/A",
      code: row.code || "N/A",
      isWinner: row.is_winner || false,
    }));

    res.json({ entries });
  } catch (error) {
    console.error("Error fetching recent activity data:", error);
    res.status(500).json({ error: "Failed to fetch recent activity data" });
  }
});

// API endpoint to update winners
app.post("/api/update-winners", async (req, res) => {
  try {
    const { winnerIds } = req.body;

    if (!winnerIds || !Array.isArray(winnerIds) || winnerIds.length === 0) {
      return res.status(400).json({ error: "Winner IDs are required" });
    }

    console.log("Updating winners:", winnerIds);

    // First, reset all is_winner flags to false
    await pool.query(
      "UPDATE codes SET is_winner = false WHERE status = 'inactive'",
    );

    // Then set is_winner = true for selected winners
    const placeholders = winnerIds.map((_, index) => `$${index + 1}`).join(",");
    const updateResult = await pool.query(
      `UPDATE codes 
       SET is_winner = true 
       WHERE code_id IN (${placeholders}) AND status = 'inactive'
       RETURNING code_id, "name", phone_number, city`,
      winnerIds,
    );

    console.log("Winners updated:", updateResult.rows);

    res.json({
      success: true,
      updatedCount: updateResult.rows.length,
      winners: updateResult.rows.map((row) => ({
        id: row.code_id,
        name: row.name? row.name.trim() : "N/A",
        phone: row.phone_number || "N/A",
        city: row.city || "N/A",
      })),
    });
  } catch (error) {
    console.error("Error updating winners:", error);
    res.status(500).json({ error: "Failed to update winners" });
  }
});

// API endpoint to send winner emails
app.post("/api/send-winner-emails", async (req, res) => {
  try {
    // Get all winners from database
    const winnersResult = await pool.query(
      `SELECT code_id, "name" as name, email, phone_number, city, code
       FROM codes 
       WHERE status = 'inactive' AND is_winner = true AND email IS NOT NULL AND email != ''
       ORDER BY created_at DESC`,
    );

    const winners = winnersResult.rows;

    if (winners.length === 0) {
      return res.status(400).json({
        error: "No winners found with valid email addresses",
      });
    }

    console.log(`Sending emails to ${winners.length} winners`);

    // Send actual emails using nodemailer
    const emailPromises = winners.map(async (winner) => {
      const emailContent = {
        to: winner.email,
        name: winner.name? winner.name.trim() : "Winner",
        city: winner.city,
        code: winner.code,
      };

      const mailOptions = {
        from: "aditya.as@somaiya.edu",
        to: emailContent.to,
        subject: "🎉 Congratulations! You're a Winner - Maidan 72 Club",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h1 style="color: #2563eb; text-align: center; margin-bottom: 30px;">🎉 Congratulations ${emailContent.name}!</h1>
              
              <p style="font-size: 18px; color: #333; line-height: 1.6;">
                We are thrilled to inform you that you've been selected as a <strong>winner</strong> in the Maidan 72 Club contest!
              </p>
              
              <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
                <h3 style="color: #1e40af; margin-top: 0;">Your Winner Details:</h3>
                <p style="margin: 5px 0;"><strong>Name:</strong> ${emailContent.name}</p>
                <p style="margin: 5px 0;"><strong>Winning Code:</strong> <span style="background-color: #dbeafe; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-weight: bold;">${emailContent.code}</span></p>
                <p style="margin: 5px 0;"><strong>Registration City:</strong> ${emailContent.city}</p>
              </div>
              
              <p style="color: #333; line-height: 1.6;">
                Please contact us as soon as possible to claim your prize. Make sure to keep your winning code safe as you'll need it for verification.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <p style="font-size: 16px; color: #666;">Thank you for participating in Maidan 72 Club!</p>
              </div>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              
              <div style="text-align: center; color: #666; font-size: 14px;">
                <p><strong>Best regards,</strong><br>Maidan 72 Club Team</p>
                <p style="margin-top: 20px; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
              </div>
            </div>
          </div>
        `,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(
          `📧 Email sent successfully to ${emailContent.name} (${emailContent.to})`,
        );

        return {
          email: emailContent.to,
          name: emailContent.name,
          status: "sent",
        };
      } catch (error) {
        console.error(
          `❌ Failed to send email to ${emailContent.to}:`,
          error.message,
        );
        return {
          email: emailContent.to,
          name: emailContent.name,
          status: "failed",
          error: error.message,
        };
      }
    });

    const emailResults = await Promise.all(emailPromises);

    // Count successful and failed emails
    const successfulEmails = emailResults.filter(
      (result) => result.status === "sent",
    );
    const failedEmails = emailResults.filter(
      (result) => result.status === "failed",
    );

    res.json({
      success: true,
      totalWinners: winners.length,
      emailsSent: successfulEmails.length,
      emailsFailed: failedEmails.length,
      results: emailResults,
      message: `${
        successfulEmails.length
      } congratulations email(s) sent successfully!${
        failedEmails.length > 0
          ? ` ${failedEmails.length} email(s) failed to send.`
          : ""
      }`,
    });
  } catch (error) {
    console.error("Error sending winner emails:", error);
    res.status(500).json({ error: "Failed to send winner emails" });
  }
});

app.get("/webhook", (req, res) => {
  const {
    "hub.mode": mode,
    "hub.verify_token": token,
    "hub.challenge": challenge,
  } = req.query;
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  const body = req.body;
  console.log("Incoming webhook:", JSON.stringify(body, null, 2));

  const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return res.sendStatus(200);

  const from = msg.from;
  const text = (msg.text?.body || "").trim();
  const sessionKey = `session:${from}`;

  let session = await redisClient.hGetAll(sessionKey);

  if (!session.step) {
    await sendText(
      from,
      `  
      👋 Welcome to Maidan 72! 🏏

        Your chance to win ICC Women's World Cup tickets & unlock once-in-a-lifetime experiences starts now!

        Rules & Terms:
        * Each entry must be from a valid Rexona purchase.
        * One entry per unique secret code.
        * Winners will be selected at random for match tickets, special access, and more.
        * Only users from India are eligible.
        * For full details, please see our [official T&Cs here](https://www.unilevernotices.com/privacy-notices/india-english.html).

        🔒 Your privacy matters! We keep your information secure and use it only for contest participation and updates. Read more at the link above.
      
        If you agree to the terms and conditions, please enter your full name.
    `,
    );
    await redisClient.hSet(sessionKey, { step: "ASK_NAME", phone: from });
    await redisClient.expire(sessionKey, 30 * 60); // 30 min timeout
  } else if (session.step === "ASK_NAME") {
    const validation = await validateWithOpenAI(text, "ASK_NAME", session);
    await sendText(from, validation.message);

    if (validation.is_valid) {
      await redisClient.hSet(sessionKey, {
        step: "ASK_EMAIL",
        name: validation.value,
      });
    }
  } else if (session.step === "ASK_EMAIL") {
    const validation = await validateWithOpenAI(text, "ASK_EMAIL", session);

    if (!validation.is_valid) {
      await sendText(from, validation.message);
      return res.sendStatus(200);
    }

    try {
      // Check if email is already registered in the database
      const emailCheck = await pool.query(
        "SELECT * FROM codes WHERE email = $1",
        [validation.value],
      );

      if (emailCheck.rows.length > 0) {
        await sendText(
          from,
          "❌ This email is already registered with us. Please provide a different email address:",
        );
      } else {
        await sendText(from, validation.message);
        await redisClient.hSet(sessionKey, {
          step: "ASK_CITY",
          email: validation.value,
        });
      }
    } catch (err) {
      console.error("Database error during email check:", err.message);
      await sendText(
        from,
        "⚠️ Something went wrong while checking your email. Please try again later.",
      );
    }
  } else if (session.step === "ASK_CITY") {
    const validation = await validateWithOpenAI(text, "ASK_CITY", session);
    await sendText(from, validation.message);

    if (validation.is_valid) {
      await redisClient.hSet(sessionKey, {
        step: "ASK_CODE",
        city: validation.value,
      });
    }
  } else if (session.step === "ASK_CODE") {
    // First validate code format with OpenAI
    const validation = await validateWithOpenAI(text, "ASK_CODE", session);

    if (!validation.is_valid) {
      await sendText(from, validation.message);
      return res.sendStatus(200);
    }

    try {
      // Check if the code exists in active codes
      const result = await pool.query(
        "SELECT * FROM codes WHERE status = 'active' AND code = $1",
        [validation.value],
      );

      if (result.rows.length > 0) {
        // ✅ Code found in database - proceed with registration
        // await sendText(from, validation.message);

        // Store the validated code in session
        await redisClient.hSet(sessionKey, { code: validation.value });

        // Update the codes table with user details and mark as inactive
        const updateSuccess = await updateCodeInDatabase({
          phone: session.phone || from,
          name: session.name,
          email: session.email,
          city: session.city,
          code: validation.value,
        });

        if (updateSuccess) {
          await redisClient.del(sessionKey);
          await sendText(
            from,
            "🎉 Congratulations! Your registration is complete. Your details have been saved and the scratch code has been marked as used.",
          );
        } else {
          await sendText(
            from,
            "⚠️ Registration failed. Please try again or contact support.",
          );
        }
      } else {
        // ❌ Code not found in database
        await sendText(
          from,
          "❌ Invalid scratch code. This code is not found in our system or has already been used. Please provide a valid scratch code:",
        );
      }
    } catch (err) {
      console.error("Database error:", err.message);
      await sendText(
        from,
        "⚠️ Something went wrong while checking your scratch code. Please try again later.",
      );
    }
  }

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("Hello World");
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log("- GET /webhook: Webhook verification");
  console.log("- POST /webhook: Conversation flow handler");
});

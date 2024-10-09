import { Telegraf, Markup } from "telegraf";
import axios from "axios";
import dotenv from "dotenv";
import express, { Request, Response } from "express";

dotenv.config();

// Set up the Telegram bot with the token
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN as string);
const usersTokens: { [userId: string]: string } = {}; // Store user tokens

// Express app to handle OAuth callback
const app = express();
const port = process.env.PORT || 3000;

// Handle the /start command
bot.start((ctx) => {
  const userId = ctx.from?.id;
  const fullName = `${ctx.from?.first_name} ${ctx.from?.last_name}`;
  const piId = userId?.toString(); // Use Telegram user ID as the unique identifier

  // Send the welcome message with a login button
  const loginUrl = `https://login.bcc.no/oauth/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${process.env.REDIRECT_URI}&audience=${process.env.API_AUDIENCE}&response_type=code&state=${piId}`;

  ctx.reply(
    `Hi ${fullName}!\n\nWelcome to the BUK Action Bot.\nPlease log in to see your pace action status.`,
    Markup.inlineKeyboard([
      [Markup.button.url("Login", loginUrl)], // Create a button that opens the login URL
    ])
  );
});

// Callback handler for the OAuth flow
app.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const piId = req.query.state as string; // Retrieve the user ID from the state

  try {
    // Exchange authorization code for an access token
    const response = await axios.post("https://login.bcc.no/oauth/token", {
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: process.env.REDIRECT_URI,
    });

    const accessToken = response.data.access_token;

    // Store the access token for the user
    usersTokens[piId] = accessToken;

    // Fetch the BUK Status for the user
    const bukStatus = await axios.get(
      "https://ca-aksjonapp-api.kindisland-edecf2b1.westeurope.azurecontainerapps.io/BukStatus/personal",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const { balance, totalAksjonTarget, isOnTrack, milestones } =
      bukStatus.data;

    // Format milestones for display
    const milestonesText = milestones
      .map(
        (m: any) =>
          `- ${m.percentage}% by ${new Date(m.date).toLocaleDateString()}`
      )
      .join("\n");

    // Send the formatted BUK status to the user
    await bot.telegram.sendMessage(
      piId,
      `Login successful!\n\nYour current BUK Status:\n\n` +
        `Balance: ${balance}\n` +
        `Total Aksjon Target: ${totalAksjonTarget}\n` +
        `Is OnTrack: ${isOnTrack ? "Yes" : "No"}\n\n` +
        `Milestones:\n${milestonesText}`
    );

    res.send("Login successful! You can now close this page.");
  } catch (error) {
    console.error("Error during token exchange:", error);
    res.status(500).send("An error occurred during the login process.");
  }
});

// Command to get the BUK status for a logged-in user
bot.command("bukstatus", async (ctx) => {
  const userId = ctx.from?.id?.toString();

  // Check if the user has logged in and has a stored token
  if (!userId || !usersTokens[userId]) {
    ctx.reply("Please log in first using the /login command.");
    return;
  }

  const token = usersTokens[userId];

  try {
    // Fetch the BUK Status for the user
    const bukStatus = await axios.get(
      "https://ca-aksjonapp-api.kindisland-edecf2b1.westeurope.azurecontainerapps.io/BukStatus/personal",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const { balance, totalAksjonTarget, isOnTrack, milestones } =
      bukStatus.data;

    // Format milestones for display
    const milestonesText = milestones
      .map(
        (m: any) =>
          `- ${m.percentage}% by ${new Date(m.date).toLocaleDateString()}`
      )
      .join("\n");

    // Send the formatted BUK status to the user
    ctx.reply(
      `Your current BUK Status:\n\n` +
        `Balance: ${balance}\n` +
        `Total Action Target: ${totalAksjonTarget}\n` +
        `Is OnTrack: ${isOnTrack ? "Yes" : "No"}\n\n` +
        `Milestones:\n${milestonesText}`
    );
  } catch (error) {
    console.error("Error fetching BUK status:", error);
    ctx.reply("An error occurred while fetching your BUK status.");
  }
});

// Start both the bot and the express server
bot.launch();
app.listen(port, () => {
  console.log(`Express server running at http://localhost:${port}`);
  console.log("Telegram bot is up and running!");
});

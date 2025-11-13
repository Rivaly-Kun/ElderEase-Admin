// ClickSend SMS Service
// Handles SMS sending through ClickSend API

const CLICKSEND_API_KEY = "6EEBE979-DC74-FFF9-6AD7-93AB34F236C9";
const CLICKSEND_USERNAME = "rianlipa28@gmail.com";
const CLICKSEND_API_URL = "https://rest.clicksend.com/v3";

// Create Basic Auth header
const getAuthHeader = () => {
  const credentials = `${CLICKSEND_USERNAME}:${CLICKSEND_API_KEY}`;
  const encodedCredentials = btoa(credentials);
  return `Basic ${encodedCredentials}`;
};

/**
 * Send SMS via ClickSend API
 * @param {string} phoneNumber - Recipient phone number (must include country code, e.g., +639001234567)
 * @param {string} message - SMS message content
 * @param {string} from - Sender ID (optional, defaults to 'ElderEase')
 * @returns {Promise<Object>} - Response from ClickSend API
 */
export const sendSMS = async (phoneNumber, message, from = "ElderEase") => {
  try {
    if (!phoneNumber || !message) {
      throw new Error("Phone number and message are required");
    }

    // Validate phone number format
    if (!phoneNumber.startsWith("+")) {
      throw new Error(
        "Phone number must start with + and include country code (e.g., +639001234567)"
      );
    }

    const payload = {
      messages: [
        {
          to: phoneNumber,
          body: message,
          from: from,
        },
      ],
    };

    const response = await fetch(`${CLICKSEND_API_URL}/sms/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.response_msg || `ClickSend API error: ${response.status}`
      );
    }

    return {
      success: true,
      messageId: data.data?.messages?.[0]?.message_id,
      status: data.data?.messages?.[0]?.status,
      response: data,
    };
  } catch (error) {
    console.error("ClickSend SMS Error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Send SMS to multiple recipients
 * @param {Array<string>} phoneNumbers - Array of recipient phone numbers
 * @param {string} message - SMS message content
 * @param {string} from - Sender ID (optional, defaults to 'ElderEase')
 * @returns {Promise<Object>} - Response with success/failure info for each recipient
 */
export const sendSMSBatch = async (
  phoneNumbers,
  message,
  from = "ElderEase"
) => {
  try {
    if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      throw new Error("Phone numbers array is required");
    }

    if (!message) {
      throw new Error("Message is required");
    }

    // Filter out invalid phone numbers
    const validNumbers = phoneNumbers.filter(
      (num) => num && typeof num === "string" && num.trim().startsWith("+")
    );

    if (validNumbers.length === 0) {
      throw new Error("No valid phone numbers provided. Format: +639001234567");
    }

    const messages = validNumbers.map((phoneNumber) => ({
      to: phoneNumber.trim(),
      body: message,
      from: from,
    }));

    const payload = { messages };

    const response = await fetch(`${CLICKSEND_API_URL}/sms/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.response_msg || `ClickSend API error: ${response.status}`
      );
    }

    const results = {
      success: true,
      totalSent: validNumbers.length,
      messages: data.data?.messages || [],
      invalidNumbers: phoneNumbers.filter(
        (num) => !num || typeof num !== "string" || !num.trim().startsWith("+")
      ),
    };

    return results;
  } catch (error) {
    console.error("ClickSend Batch SMS Error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get SMS account balance/credit
 * @returns {Promise<Object>} - Account balance info
 */
export const getAccountBalance = async () => {
  try {
    const response = await fetch(`${CLICKSEND_API_URL}/account`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.response_msg || `ClickSend API error: ${response.status}`
      );
    }

    return {
      success: true,
      balance: data.data?.balance,
      currency: data.data?.currency,
      smsCredit: data.data?.sms_credit,
    };
  } catch (error) {
    console.error("ClickSend Balance Error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

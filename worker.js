
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      city TEXT NOT NULL,
      address TEXT,
      monthly_rent REAL NOT NULL,
      bedrooms INTEGER NOT NULL,
      property_type TEXT,
      description TEXT,
      image_url TEXT,
      agency_name TEXT,
      contact_email TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER NOT NULL DEFAULT 1
    )
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_listings_city
    ON listings(city)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_listings_rent
    ON listings(monthly_rent)
  `).run();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path !== "/api/health" && path !== "/api/listings") {
      return json({ error: "Not found" }, 404);
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (!env.DB) {
      return json({
        error: "D1 database binding DB is missing"
      }, 500);
    }

    try {
      await ensureSchema(env.DB);

      if (path === "/api/health") {
        return json({
          success: true,
          message: "Hata in NL API is running",
          database: "connected",
        });
      }

      const city = url.searchParams.get("city");
      const maxRentValue = url.searchParams.get("maxRent");
      const bedroomsValue = url.searchParams.get("bedrooms");

      const maxRent = maxRentValue === null
        ? null
        : Number(maxRentValue);

      const bedrooms = bedroomsValue === null
        ? null
        : Number(bedroomsValue);

      if (
        maxRent !== null &&
        (!Number.isFinite(maxRent) || maxRent < 0)
      ) {
        return json({ error: "Invalid maxRent" }, 400);
      }

      if (
        bedrooms !== null &&
        (!Number.isInteger(bedrooms) || bedrooms < 0)
      ) {
        return json({ error: "Invalid bedrooms" }, 400);
      }

      const result = await env.DB.prepare(`
        SELECT
          id, title, city, address, monthly_rent,
          bedrooms, property_type, description,
          image_url, agency_name, contact_email, created_at
        FROM listings
        WHERE is_active = 1
          AND (? IS NULL OR city LIKE ?)
          AND (? IS NULL OR monthly_rent <= ?)
          AND (? IS NULL OR bedrooms >= ?)
        ORDER BY created_at DESC
        LIMIT 100
      `).bind(
        city,
        city ? `%${city}%` : null,
        maxRent,
        maxRent,
        bedrooms,
        bedrooms
      ).all();

      return json({
        success: true,
        count: result.results.length,
        listings: result.results,
      });

    } catch (error) {
      return json({
        success: false,
        error: "Database or API error",
      }, 500);
    }
  },
};
 

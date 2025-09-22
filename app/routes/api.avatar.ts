import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';

// Framework-agnostic handler for serverless compatibility
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const imageUrl = url.searchParams.get('url');

    if (!imageUrl) {
      return json({ error: 'Missing image URL parameter' }, { status: 400 });
    }

    // Validate URL is from Google (lh3.googleusercontent.com)
    const allowedHosts = [
      'lh3.googleusercontent.com',
      'lh4.googleusercontent.com',
      'lh5.googleusercontent.com',
      'lh6.googleusercontent.com',
      'ssl.gstatic.com', // Google also uses this for profile images
    ];

    const imageUrlObj = new URL(imageUrl);
    const isAllowedHost = allowedHosts.some(host => imageUrlObj.hostname === host);

    if (!isAllowedHost) {
      return json({ error: 'Only Google avatar URLs are allowed' }, { status: 403 });
    }

    // Fetch the image from Google
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Avatar Proxy)',
        'Accept': 'image/*',
      },
    });

    if (!response.ok) {
      return json({ error: 'Failed to fetch image' }, { status: response.status });
    }

    // Get the image buffer
    const imageBuffer = await response.arrayBuffer();

    // Return the image with proper headers for caching and CORS
    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400', // Cache for 24 hours
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cross-Origin-Resource-Policy': 'cross-origin', // Allow cross-origin embedding
      },
    });

  } catch (error) {
    console.error('Avatar proxy error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Handle OPTIONS requests for CORS preflight
export async function action({ request }: LoaderFunctionArgs) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400', // Cache preflight for 24 hours
      },
    });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}

import { getOrganizations } from '../lib/organizations';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://itsplayday.com';

function generateSiteMap(organizations) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Static pages -->
  <url>
    <loc>${SITE_URL}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_URL}/browse</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${SITE_URL}/auth/login</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <!-- Dynamic organization pages -->
  ${organizations
    .map((org) => {
      return `
  <url>
    <loc>${SITE_URL}/${org.slug}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join('')}
</urlset>`;
}

export async function getServerSideProps({ res }) {
  try {
    // Get all public organizations
    const allOrgs = await getOrganizations();
    const publicOrgs = allOrgs.filter(org => org.status === 'active' && org.visibility === 'public');

    // Generate the XML sitemap
    const sitemap = generateSiteMap(publicOrgs);

    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate');
    res.write(sitemap);
    res.end();
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.statusCode = 500;
    res.end();
  }

  return {
    props: {},
  };
}

// Default export to satisfy Next.js
export default function Sitemap() {
  return null;
}

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { z } from 'zod';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs'

const generateSchema = z.object({
  productName: z.string().min(1).max(200),
  category: z.string().optional(),
  features: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const validation = generateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: validation.error.errors[0]?.message || 'Invalid data'
      }, { status: 400 });
    }

    const { productName, category, features } = validation.data;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'AI service not configured. Please set GEMINI_API_KEY in environment variables.'
      }, { status: 503 });
    }

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `Generate a professional product description for a source code product named "${productName}"${category ? ` in the ${category} category` : ''}.

Requirements:
- Write in Vietnamese
- Include key features and use cases
- Add SEO-friendly keywords
- Make it engaging and professional
- Length: 200-300 words
${features && features.length > 0 ? `- Include these features: ${features.join(', ')}` : ''}

Format the response as JSON with these fields:
{
  "description": "Full product description",
  "shortDescription": "Brief summary (50-100 words)",
  "features": ["feature1", "feature2", ...],
  "tags": ["tag1", "tag2", ...],
  "seoKeywords": ["keyword1", "keyword2", ...]
}`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Try to parse JSON from response
      let parsedResponse;
      try {
        // Extract JSON from markdown code blocks if present
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
        const jsonText = jsonMatch ? jsonMatch[1] : text;
        parsedResponse = JSON.parse(jsonText);
      } catch {
        // If not JSON, return as plain text
        parsedResponse = {
          description: text,
          shortDescription: text.substring(0, 100) + '...',
          features: [],
          tags: category ? [category] : [],
          seoKeywords: [],
        };
      }

      return NextResponse.json({
        success: true,
        data: parsedResponse,
      });
    } catch (error: any) {
      logger.error('AI generation error', error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to generate description'
      }, { status: 500 });
    }
  } catch (error: any) {
    if (error.message?.includes('Unauthorized')) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }
    logger.error('AI route error', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

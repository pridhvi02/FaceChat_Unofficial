import { NextResponse } from 'next/server'
import { Polly } from '@aws-sdk/client-polly'

const polly = new Polly({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  },
});

export async function POST(request) {
  const { text } = await request.json();
  const params = {
    Text: text,
    OutputFormat: 'json',
    SpeechMarkTypes: ['viseme', 'word'],
    VoiceId: 'Brian'
  };

  try {
    console.log('Calling Polly synthesizeSpeech for speech marks');
    const result = await polly.synthesizeSpeech(params);
    console.log('Polly call for speech marks successful');

    // Handle speech marks
    const speechMarksBuffer = await result.AudioStream.transformToByteArray();
    const speechMarksString = Buffer.from(speechMarksBuffer).toString('utf-8');
    const speechMarks = speechMarksString.split('\n')
      .filter(line => line.trim() !== '')
      .map(line => JSON.parse(line));

    // Now get the audio
    const audioParams = {
      ...params,
      OutputFormat: 'mp3',
      SpeechMarkTypes: []
    };

    console.log('Calling Polly synthesizeSpeech for audio');
    const audioResult = await polly.synthesizeSpeech(audioParams);
    console.log('Polly call for audio successful');

    const audioBuffer = Buffer.from(await audioResult.AudioStream.transformToByteArray());

    return NextResponse.json({
      speechMarks,
      audioContent: audioBuffer.toString('base64')
    });
  } catch (error) {
    console.error('Detailed error:', error);
    return NextResponse.json({ error: 'Failed to synthesize speech' }, { status: 500 });
  }
}
import 'dotenv/config';

const accountId = process.argv[2] || '1';

function randomInRange(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(1));
}

const payload = {
  accountId,
  quotas: [
    {
      modelName: 'Gemini 3.1 Pro (High)',
      remainingPercentage: randomInRange(5, 95),
      refreshTime: '12 hours, 0 min',
    },
    {
      modelName: 'Gemini 3 Flash',
      remainingPercentage: randomInRange(5, 95),
      refreshTime: '8 hours, 20 min',
    },
    {
      modelName: 'Claude Sonnet 4.6',
      remainingPercentage: randomInRange(5, 95),
      refreshTime: '6 hours, 0 min',
    },
    {
      modelName: 'GPT-OSS 120B (Medium)',
      remainingPercentage: randomInRange(5, 95),
      refreshTime: '4 hours, 30 min',
    },
  ],
};

process.stdout.write(JSON.stringify(payload));

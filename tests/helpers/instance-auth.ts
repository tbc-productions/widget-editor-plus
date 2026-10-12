export function instanceAuthHeaders(): Record<string, string> {
  if (process.env.SN_SDK_SESSION_COOKIE && process.env.SN_SDK_SESSION_TOKEN) {
    return {
      Cookie: process.env.SN_SDK_SESSION_COOKIE,
      'X-UserToken': process.env.SN_SDK_SESSION_TOKEN,
    };
  }
  const username = process.env.SN_USERNAME;
  const password = process.env.SN_PASSWORD;
  if (!username || !password) throw new Error('ServiceNow test credentials are missing.');
  return { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` };
}

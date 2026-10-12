import { expect, type APIRequestContext } from '@playwright/test';
import { instanceAuthHeaders } from './instance-auth';

export async function getTestWidgetSysId(request: APIRequestContext, baseURL: string): Promise<string> {
  let sysId = '';
  await expect(async () => {
    const response = await request.get(
      `${baseURL}/api/now/table/sp_widget?sysparm_query=id=e2e_test_widget&sysparm_fields=sys_id`,
      { headers: instanceAuthHeaders() }
    );
    expect(response.ok()).toBe(true);
    sysId = (await response.json()).result?.[0]?.sys_id || '';
    expect(sysId).toBeTruthy();
  }).toPass({ timeout: 15000, intervals: [250, 500, 1000] });
  return sysId;
}

export async function expectSavedWidgetField(
  request: APIRequestContext,
  baseURL: string,
  sysId: string,
  field: string,
  marker: string
) {
  await expect
    .poll(async () => {
      const response = await request.get(`${baseURL}/api/now/table/sp_widget/${sysId}?sysparm_fields=${field}`, {
        headers: instanceAuthHeaders(),
      });
      expect(response.ok()).toBe(true);
      return (await response.json()).result[field];
    })
    .toContain(marker);
}

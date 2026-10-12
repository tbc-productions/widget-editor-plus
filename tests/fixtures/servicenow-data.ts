import * as dotenv from 'dotenv';
import * as path from 'path';
import { instanceAuthHeaders } from '../helpers/instance-auth';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface ServiceNowTestData {
  widgetSysId: string;
  pageId: string;
  pageSysId: string;
  updateSetSysId?: string;
}

/**
 * Ensures test records (sp_widget, sp_page, sp_container, sp_row, sp_column, sp_instance)
 * exist on the target ServiceNow instance via Table API under the configured update set.
 * Creates/updates them dynamically so tests run reliably on any PDI.
 */
export async function seedServiceNowTestData(): Promise<ServiceNowTestData | null> {
  const baseURL = process.env.SN_INSTANCE_URL;
  const username = process.env.SN_USERNAME;
  const password = process.env.SN_PASSWORD;
  const updateSetName = process.env.SN_UPDATE_SET || 'Default';

  if (!baseURL || !username || !password) {
    console.warn('[E2E Setup] Missing SN_INSTANCE_URL, SN_USERNAME, or SN_PASSWORD. Skipping automated test data seeding.');
    return null;
  }

  const headers: Record<string, string> = {
    ...instanceAuthHeaders(),
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  try {
    // 0. Resolve target Update Set (defaults to 'Default' or 'Global')
    const updateSetSysId = await resolveUpdateSet(baseURL, headers, updateSetName);
    if (updateSetSysId) {
      headers['X-User-Preference-sys_update_set'] = updateSetSysId;
    }

    // 1. Ensure test sp_widget exists and has updated expanded HTML + JSDoc @typedef scripts
    const widgetSysId = await ensureTestWidget(baseURL, headers, updateSetSysId);
    
    // 2. Ensure test sp_page exists
    const pageData = await ensureTestPage(baseURL, headers);

    // 3. Ensure Service Portal layout structure (container -> row -> column -> instances)
    if (pageData.sysId) {
      const containerSysId = await ensureTestContainer(baseURL, headers, pageData.sysId);
      const rowSysId = await ensureTestRow(baseURL, headers, containerSysId);
      const columnSysId = await ensureTestColumn(baseURL, headers, rowSysId);
      
      // Place test widget
      if (widgetSysId) {
        await ensureWidgetInstance(baseURL, headers, columnSysId, widgetSysId, 'E2E Test Widget Instance');
      }

      // Place Widget Editor Debug Menu widget (sys_id: d7ad6f7083f7be1070b8b5dfeeaad39d) on test page
      const debugMenuWidgetSysId = 'd7ad6f7083f7be1070b8b5dfeeaad39d';
      await ensureWidgetInstance(baseURL, headers, columnSysId, debugMenuWidgetSysId, 'Debug Menu Instance');
    }

    return {
      widgetSysId,
      pageId: pageData.id,
      pageSysId: pageData.sysId,
      updateSetSysId,
    };
  } catch (err) {
    throw new Error('Failed to seed ServiceNow test data.', { cause: err });
  }
}

/**
 * Removes created test data (sp_instance, sp_column, sp_row, sp_container, sp_page, sp_widget)
 * if SN_CLEANUP_TEST_DATA is true (default: true).
 */
export async function cleanupServiceNowTestData(): Promise<void> {
  const shouldCleanup = (process.env.SN_CLEANUP_TEST_DATA || 'true').toLowerCase() !== 'false';
  if (!shouldCleanup) {
    console.log('[E2E Teardown] SN_CLEANUP_TEST_DATA is false. Preserving test records on PDI.');
    return;
  }

  const baseURL = process.env.SN_INSTANCE_URL;
  const username = process.env.SN_USERNAME;
  const password = process.env.SN_PASSWORD;

  if (!baseURL || !username || !password) return;

  const headers = {
    ...instanceAuthHeaders(),
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  console.log('[E2E Teardown] Cleaning up automated test records from target PDI...');
  try {
    // 1. Find and delete test sp_page (and associated containers/instances)
    const pageUrl = `${baseURL}/api/now/table/sp_page?sysparm_query=id=e2e_widget_editor_test&sysparm_fields=sys_id`;
    const pageRes = await fetch(pageUrl, { headers });
    const pageData = await pageRes.json();
    if (pageData.result && pageData.result.length > 0) {
      const pageSysId = pageData.result[0].sys_id;

      // Delete containers
      const containerUrl = `${baseURL}/api/now/table/sp_container?sysparm_query=sp_page=${pageSysId}&sysparm_fields=sys_id`;
      const containerRes = await fetch(containerUrl, { headers });
      const containerData = await containerRes.json();
      if (containerData.result) {
        for (const c of containerData.result) {
          await fetch(`${baseURL}/api/now/table/sp_container/${c.sys_id}`, { method: 'DELETE', headers });
        }
      }

      // Delete test page
      await fetch(`${baseURL}/api/now/table/sp_page/${pageSysId}`, { method: 'DELETE', headers });
      console.log(`[E2E Teardown] Deleted test page ${pageSysId}`);
    }

    // 2. Delete test sp_widget
    const widgetUrl = `${baseURL}/api/now/table/sp_widget?sysparm_query=id=e2e_test_widget&sysparm_fields=sys_id`;
    const widgetRes = await fetch(widgetUrl, { headers });
    const widgetData = await widgetRes.json();
    if (widgetData.result && widgetData.result.length > 0) {
      const widgetSysId = widgetData.result[0].sys_id;
      await fetch(`${baseURL}/api/now/table/sp_widget/${widgetSysId}`, { method: 'DELETE', headers });
      console.log(`[E2E Teardown] Deleted test widget ${widgetSysId}`);
    }
  } catch (err) {
    console.error('[E2E Teardown] Error cleaning up test data:', err);
  }
}

async function resolveUpdateSet(baseURL: string, headers: Record<string, string>, targetName: string): Promise<string> {
  const queryUrl = `${baseURL}/api/now/table/sys_update_set?sysparm_query=name=${encodeURIComponent(targetName)}^ORname=Default^ORname=Global^state=in progress&sysparm_fields=sys_id,name`;
  try {
    const res = await fetch(queryUrl, { headers });
    const data = await res.json();
    if (data.result && data.result.length > 0) {
      return data.result[0].sys_id;
    }
  } catch (e) {
    console.warn('[E2E Setup] Could not query sys_update_set:', e);
  }
  return '';
}

async function ensureTestWidget(baseURL: string, headers: Record<string, string>, updateSetSysId?: string): Promise<string> {
  const widgetData = {
    name: '[E2E] Widget Editor+ Test Widget',
    id: 'e2e_test_widget',
    template: `<div class="e2e-test-widget panel panel-primary" style="min-height: 400px; padding: 20px; margin: 20px;">
  <div class="panel-heading">
    <h2 class="panel-title e2e-widget-title">{{::c.data.title}}</h2>
  </div>
  <div class="panel-body e2e-content-area" style="min-height: 250px; background: #ffffff;">
    <p class="e2e-description">Widget Editor+ End-to-End Test Container for Debug Menu and Monaco Editor validation.</p>
    <div class="well e2e-interactive-box" style="padding: 15px; border: 1px solid #ccc; background-color: #f9f9f9; margin-top: 15px;">
      <h4>Interactive Test Element</h4>
      <p>User: <strong class="e2e-user-name">{{c.user.name}}</strong> (Role: <em class="e2e-user-role">{{c.user.role}}</em>)</p>
      <button type="button" class="btn btn-info e2e-test-btn" ng-click="c.clickTest()">Click E2E Test Button</button>
    </div>
  </div>
</div>`,
    client_script: `/**
 * @typedef {Object} E2EUser
 * @property {string} name - The user display name
 * @property {string} role - Assigned role
 * @property {boolean} active - Status
 */

/**
 * Client Controller for Widget Editor+ E2E Test Widget
 * @param {Object} $scope - AngularJS scope
 * @param {Object} spUtil - Service Portal utility service
 */
function clientController($scope, spUtil) {
  var c = this;

  /** @type {E2EUser} */
  c.user = {
    name: 'E2E Test User',
    role: 'admin',
    active: true
  };

  c.clickTest = function() {
    console.log('E2E Test Button Clicked for user:', c.user.name);
  };
}`,
    script: `/**
 * @typedef {Object} E2EServerConfig
 * @property {string} instanceName - ServiceNow instance ID
 * @property {number} maxItems - Maximum item count
 * @property {boolean} debugEnabled - Debug mode flag
 */

(function() {
  /** @type {E2EServerConfig} */
  var config = {
    instanceName: 'PDI E2E Instance',
    maxItems: 50,
    debugEnabled: true
  };

  data.title = 'Widget Editor+ E2E Test Widget';
  data.config = config;

  var gr = new GlideRecordSecure('sys_user');
  gr.setLimit(1);
  gr.query();
  if (gr.next()) {
    data.sampleUser = gr.getValue('user_name');
  }
})();`,
    css: `.e2e-test-widget { border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.e2e-content-area { cursor: pointer; }`,
    description: 'Automated test widget created by Widget Editor+ Playwright E2E suite with JSDoc @typedef support.',
  };

  const queryUrl = `${baseURL}/api/now/table/sp_widget?sysparm_query=id=e2e_test_widget&sysparm_fields=sys_id,id`;
  const res = await fetch(queryUrl, { headers });
  const data = await res.json();

  const extraParam = updateSetSysId ? `?sysparm_update_set=${updateSetSysId}` : '';

  if (data.result && data.result.length > 0) {
    const sysId = data.result[0].sys_id;
    await fetch(`${baseURL}/api/now/table/sp_widget/${sysId}${extraParam}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(widgetData),
    });
    return sysId;
  }

  console.log('[E2E Setup] Creating test sp_widget record...');
  const createRes = await fetch(`${baseURL}/api/now/table/sp_widget${extraParam}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(widgetData),
  });

  const createData = await createRes.json();
  if (createData.result && createData.result.sys_id) {
    return createData.result.sys_id;
  }

  throw new Error(`Failed to create test widget: ${JSON.stringify(createData)}`);
}

async function ensureTestPage(baseURL: string, headers: Record<string, string>): Promise<{ id: string; sysId: string }> {
  const pageId = 'e2e_widget_editor_test';
  const queryUrl = `${baseURL}/api/now/table/sp_page?sysparm_query=id=${pageId}&sysparm_fields=sys_id,id`;
  const res = await fetch(queryUrl, { headers });
  const data = await res.json();

  if (data.result && data.result.length > 0) {
    return { id: pageId, sysId: data.result[0].sys_id };
  }

  console.log('[E2E Setup] Creating test sp_page record...');
  const createUrl = `${baseURL}/api/now/table/sp_page`;
  const body = {
    title: 'Widget Editor+ E2E Test Page',
    id: pageId,
  };

  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const createData = await createRes.json();
  if (createData.result && createData.result.sys_id) {
    return { id: pageId, sysId: createData.result.sys_id };
  }

  throw new Error(`Failed to create test page: ${JSON.stringify(createData)}`);
}

async function ensureTestContainer(baseURL: string, headers: Record<string, string>, pageSysId: string): Promise<string> {
  const queryUrl = `${baseURL}/api/now/table/sp_container?sysparm_query=sp_page=${pageSysId}&sysparm_fields=sys_id`;
  const res = await fetch(queryUrl, { headers });
  const data = await res.json();

  if (data.result && data.result.length > 0) {
    return data.result[0].sys_id;
  }

  const createRes = await fetch(`${baseURL}/api/now/table/sp_container`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sp_page: pageSysId }),
  });
  const createData = await createRes.json();
  return createData.result?.sys_id || '';
}

async function ensureTestRow(baseURL: string, headers: Record<string, string>, containerSysId: string): Promise<string> {
  const queryUrl = `${baseURL}/api/now/table/sp_row?sysparm_query=sp_container=${containerSysId}&sysparm_fields=sys_id`;
  const res = await fetch(queryUrl, { headers });
  const data = await res.json();

  if (data.result && data.result.length > 0) {
    return data.result[0].sys_id;
  }

  const createRes = await fetch(`${baseURL}/api/now/table/sp_row`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sp_container: containerSysId }),
  });
  const createData = await createRes.json();
  return createData.result?.sys_id || '';
}

async function ensureTestColumn(baseURL: string, headers: Record<string, string>, rowSysId: string): Promise<string> {
  const queryUrl = `${baseURL}/api/now/table/sp_column?sysparm_query=sp_row=${rowSysId}&sysparm_fields=sys_id`;
  const res = await fetch(queryUrl, { headers });
  const data = await res.json();

  if (data.result && data.result.length > 0) {
    return data.result[0].sys_id;
  }

  const createRes = await fetch(`${baseURL}/api/now/table/sp_column`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sp_row: rowSysId, size: '12' }),
  });
  const createData = await createRes.json();
  return createData.result?.sys_id || '';
}

async function ensureWidgetInstance(
  baseURL: string,
  headers: Record<string, string>,
  columnSysId: string,
  widgetSysId: string,
  instanceTitle: string
): Promise<string> {
  const queryUrl = `${baseURL}/api/now/table/sp_instance?sysparm_query=sp_column=${columnSysId}^sp_widget=${widgetSysId}&sysparm_fields=sys_id`;
  const res = await fetch(queryUrl, { headers });
  const data = await res.json();

  if (data.result && data.result.length > 0) {
    return data.result[0].sys_id;
  }

  const createRes = await fetch(`${baseURL}/api/now/table/sp_instance`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: instanceTitle,
      sp_column: columnSysId,
      sp_widget: widgetSysId,
    }),
  });

  const createData = await createRes.json();
  return createData.result?.sys_id || '';
}

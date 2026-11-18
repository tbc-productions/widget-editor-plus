# Copilot agent for ServiceNow developers

A Microsoft 365 Copilot agent and skills for ServiceNow development and Widget Editor+ AI Assistant exports.

## Set up

1. In the Microsoft 365 Copilot app, create an agent named **ServiceNow Developer**, using the `description` from the top of [`servicenow-developer.agent.md`](.github/agents/servicenow-developer.agent.md).
2. Paste the rest of that file, from `# ServiceNow Developer` onwards, into the agent's **Instructions**.
3. Add each `SKILL.md` file under [`.github/skills/`](.github/skills/) to the agent.
4. Add these suggested prompts:

   | Title | Prompt |
   |---|---|
   | Peer review | Peer review the attached export. Focus on what changed in the update set. |
   | Debug code | The code isn't working as expected. Find the problem and explain how I can fix it. |
   | Refactor code | Refactor the code for readability and performance without changing what it does. |
   | Check accessibility | Check HTML for accessibility problems and suggest fixes. |
   | Write JSDoc | Write JSDoc comments for each function in the code. |

5. Optionally, attach a stylesheet as knowledge. The agent uses its classes and variables in templates and CSS.

Keep the instructions short enough for the app's instruction limit. Put new detail in the skill files instead.

## Contents

| File | Purpose |
|---|---|
| [`agents/servicenow-developer.agent.md`](.github/agents/servicenow-developer.agent.md) | Lean ServiceNow developer persona with sensible input validation. |
| [`skills/servicenow-jsdoc`](.github/skills/servicenow-jsdoc/SKILL.md) | JSDoc conventions for ServiceNow scripts. |
| [`skills/servicenow-es-compatibility`](.github/skills/servicenow-es-compatibility/SKILL.md) | Safe syntax by script type and ES12 mode. |
| [`skills/widget-editor-assistant-export`](.github/skills/widget-editor-assistant-export/SKILL.md) | Reading AI Assistant `context_bundle` XML exports. |
| [`skills/servicenow-server-scripting`](.github/skills/servicenow-server-scripting/SKILL.md) | GlideRecord, security, Script Includes, business rules, REST, UI actions, scheduled jobs, fix scripts and email scripts. |
| [`skills/servicenow-client-scripts`](.github/skills/servicenow-client-scripts/SKILL.md) | Client scripts, UI policies, `g_form`, GlideAjax, UI actions, UI scripts and UI pages. |
| [`skills/service-portal-widgets`](.github/skills/service-portal-widgets/SKILL.md) | Widget scripts, templates, CSS, Angular providers, ng-templates and style sheets. |
| [`skills/servicenow-peer-review`](.github/skills/servicenow-peer-review/SKILL.md) | Prioritised peer review grouped by record, with category ratings. |

## Usage

Paste a script or describe a record, or export context from AI Assistant and attach the XML file in a chat with the agent, then describe the change. The agent assumes the Australia release or later. Say "Review my code" or "Peer review" for a prioritised review.

# Copilot agent for ServiceNow developers

A GitHub Copilot custom agent and skills for ServiceNow development and Widget Editor+ AI Assistant exports.

## Install

Copy the `.github` folder into the root of your repository or VS Code workspace, merging it with any existing `.github` folder. In Copilot Chat, select **ServiceNow Developer** from the agent picker.

To use the skills in every workspace, copy the folders under `.github/skills/` into `~/.copilot/skills/`.

## Contents

| File | Purpose |
|---|---|
| [`agents/servicenow-developer.agent.md`](.github/agents/servicenow-developer.agent.md) | Lean ServiceNow developer persona with sensible input validation. |
| [`skills/servicenow-jsdoc`](.github/skills/servicenow-jsdoc/SKILL.md) | JSDoc conventions for ServiceNow scripts. |
| [`skills/servicenow-es-compatibility`](.github/skills/servicenow-es-compatibility/SKILL.md) | Safe syntax by release, scope and ES12 mode. |
| [`skills/widget-editor-assistant-export`](.github/skills/widget-editor-assistant-export/SKILL.md) | Reading AI Assistant `context_bundle` XML exports. |
| [`skills/servicenow-server-scripting`](.github/skills/servicenow-server-scripting/SKILL.md) | GlideRecord, Script Include, GlideAjax and business rule patterns. |
| [`skills/servicenow-client-scripts`](.github/skills/servicenow-client-scripts/SKILL.md) | Client scripts, UI policies, `g_form` and client-side GlideAjax. |
| [`skills/service-portal-widgets`](.github/skills/service-portal-widgets/SKILL.md) | Widget scripts, templates, CSS and Angular providers. |
| [`skills/servicenow-peer-review`](.github/skills/servicenow-peer-review/SKILL.md) | Prioritised peer review grouped by record, with category ratings. |

## Usage

Export context from AI Assistant, attach the XML file in Copilot Chat, and describe the change. Mention the target release if it is not Australia or later. Say "Review my code" or "Peer review" for a prioritised review.

export const default_actions = [
		{
		"id": 4,
		"name": "action_selector",
		"description": "",
		"parameters": [
			{
				"data_type": "string",
				"field_name": "message",
				"is_required": true
			}
		],
		"config": {
			"message": "## Allowed Scenarios:\n{{outputs.scenarios}}\n\n\n## User Prompt:\n{{params.message}}",
			"model_name": "action_selector_15",
			"system_prompt": "{{params.system_prompt}}"
		},
		"pre_hooks": [
			{
				"template": 6,
				"output_as": "scenarios",
				"context_as": "",
				"parameters": {
					"last_scenario": "{{context.last_scenario ? context.last_scenario : 'start'}}"
				},
				"output_template": {},
				"context_template": {}
			}
		],
		"post_hooks": [],
		"output_as": "action",
		"output_template": "",
		"context_as": "last_scenario",
		"context_template": "{{result.scenario}}",
		"updated_at": "2025-09-20T01:38:13.378Z"
	},
	{
		"id": 12,
		"name": "sms_action_trigger",
		"description": "Sms Trigger Template",
		"parameters": [
			{
				"data_type": "string",
				"field_name": "sender",
				"is_required": false
			},
			{
				"data_type": "string",
				"field_name": "message",
				"is_required": false,
				"default_value": "Message Received!"
			},
			{
				"data_type": "string",
				"field_name": "system",
				"is_required": false,
				"default_value": "9368263352"
			}
		],
		"config": {
			"sender": "{{params.system}}",
			"message": "{{params.message}}",
			"recipients": [
				"{{params.sender}}"
			],
			"message_types": [
				"FLASH"
			]
		},
		"pre_hooks": [
			{
				"template": 15,
				"condition": "{ \"field\": \"result[0]\", \"operator\": \"exists\" }",
				"output_as": "customer",
				"context_as": "customer",
				"parameters": {
					"phoneNumber": "{{params.sender}}"
				},
				"output_template": "{{result[0].attributes}}",
				"context_template": {
					"customer": "{{result}}"
				}
			},
			{
				"template": 4,
				"output_as": "action",
				"context_as": "last_scenario",
				"parameters": {
					"message": "{{params.message}}"
				},
				"context_template": "{{result.scenario}}"
			}
		],
		"post_hooks": [],
		"output_as": "",
		"output_template": "",
		"context_as": "",
		"context_template": "",
		"updated_at": "1970-01-01T07:30:00.000Z"
	}
]

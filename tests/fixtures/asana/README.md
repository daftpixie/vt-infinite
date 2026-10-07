# Synthetic Asana fixtures

Every value in these files is synthetic. They are shaped like the documented responses of Asana's `GET /projects/{project_gid}/tasks`, `GET /tasks/{task_gid}/subtasks` (a `data` array and a `next_page` object with an `offset`, or `null` on the last page) and the OAuth token endpoint. Short numeric strings stand in for task IDs; no real ID, title, person or project appears.

Each task carries fields the reader never asks for (`notes`, `assignee`, `followers`, `tags`, `custom_fields`, `permalink_url`) so the tests can prove they are dropped before anything is stored.

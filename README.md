# audit-lab

You cannot search for the name of a thing you have never heard of. This is that
list of names, turned into a script that asks the questions against a running
backend and reports what it was able to do.

The auditor holds nothing but the **app id that ships inside every front-end
bundle**. Every check is performed, not inferred.

## Run it

```
./run.sh
```

Needs Docker and Node 22. It stands up a backend configured the way these tools
leave one, audits it, applies the fixes, audits it again, and then checks the app
still works.

## What it found

| | before | after |
| --- | --- | --- |
| things nobody asked about | **7** | **0** |
| a stranger can read your rows | yes, 12 | no |
| a stranger can add rows | yes, every class | no |
| a stranger can delete rows | yes, every class | no |
| a stranger can edit someone else's row | yes | no |
| provider keys readable by a stranger | 2 | 0 |
| class operations open to everyone | 18 of 18 | 0 of 18 |

## What it costs

Closing those permissions is not free, and the lab measures that too:

```
ana logs in:                        yes
ana reads patients:                 5 rows
a stranger reads patients:          refused
ana writes an appointment directly: no — writes belong in a server function
```

A signed-in person can still read what the app shows. What stops working is the
browser writing to the database directly, so every write has to move into a
server-side function. That is real work, not a toggle, and it is the honest price
of the fix.

## Point it at your own backend

Edit `client.mjs` and change `APP` to your own base URL, app id and master key.
The audit only ever creates rows it then deletes; the one write it makes to an
existing row writes back the value that row already had.

## The pieces

| file | what it does |
| --- | --- |
| `audit.mjs` | the nine questions, asked as a stranger and confirmed against the permissions |
| `seed.mjs` | an app of the shape these tools produce, including a key stored in a row |
| `harden.mjs` | the fixes the audit asks for |
| `smoke.mjs` | proves the app still works for a signed-in person afterwards |
| `client.mjs` | the two ways to call the backend: as a stranger, and as the owner |

## The nine questions

1. Can a stranger list every class and field you have?
2. Can a stranger read your rows?
3. Can a stranger download your user list, with email addresses?
4. Can a stranger add rows to your classes?
5. Can a stranger delete your rows?
6. Can a stranger edit a row that is not theirs?
7. Can a stranger create brand-new classes in your database?
8. Are any of your third-party keys readable by a stranger?
9. What do your class permissions actually say?

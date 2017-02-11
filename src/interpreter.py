import sys
import time
import json

__saved_lines = []

while True:
    # payload = '__EXEC:a = 1'
    # payload = '__EVAL:json.dumps(a)'
    payload = sys.stdin.readline().strip() # assume one line is one command, with newlines displayed as __NEWLINE__
    if payload:

        cleaned_payload = payload.replace('__NEWLINE__', '\n')

        try:
            if cleaned_payload.startswith('__EXEC:'):
                cleaned_payload = cleaned_payload[7:]
                exec(cleaned_payload)
                sys.stdout.write('Payload executed successfully: '+cleaned_payload)
                sys.stdout.flush()

            elif cleaned_payload.startswith('__EVAL:'):
                cleaned_payload = cleaned_payload[7:]
                sys.stdout.write(eval(cleaned_payload))
                sys.stdout.flush()

            else:
                raise Exception('Payload did not start with execution instruction __EXEC or __EVAL')

            # should really just write this data to a file
            __saved_lines.append(cleaned_payload)

            # sys.stdout.write('Successfully ran payload "{}"\n'.format(payload))
            # sys.stdout.flush()

        except Exception as e:
            sys.stderr.write('Error while running payload "{}": {}'.format(payload, e))
            sys.stderr.flush()

    time.sleep(.01)
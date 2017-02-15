import sys
import json
from datetime import datetime

user_globals = {'json': json}

with open('/Users/glen/tmp/'+str(datetime.now())+'.txt', 'wb') as log_file:

    while True:

        # I would use sys.stdin.readline() here, but it seems like there's a bug where
        # if input is being sent in too fast then readlines takes incoming pieces instead of
        # separating by new line.

        accumulating_payload = ''
        next_character = sys.stdin.read(1)
        # Data format is one line per command, with newlines within a command displayed as __NEWLINE__
        while next_character != '\n':
            accumulating_payload += next_character # @Speed? Is appending characters to strings too slow?
            next_character = sys.stdin.read(1) # Note: I believe the program execution is paused while waiting for the next character.

        payload = accumulating_payload
        # payload = '__EXEC:a = 1'
        # payload = '__EVAL:json.dumps(a)'

        if payload:

            cleaned_payload = payload.replace('__NEWLINE__', '\n')

            try:
                if cleaned_payload.startswith('__EXEC:'):
                    cleaned_payload = cleaned_payload[7:]
                    exec(cleaned_payload, user_globals)
                    sys.stdout.write('Payload executed successfully: {}\n'.format(cleaned_payload.replace('\n', '__NEWLINE__')))
                    sys.stdout.flush()

                elif cleaned_payload.startswith('__EVAL:'):
                    cleaned_payload = cleaned_payload[7:]
                    sys.stdout.write(eval(cleaned_payload, user_globals)+'\n')
                    sys.stdout.flush()

                else:
                    raise Exception('Payload did not start with execution instruction __EXEC or __EVAL')

                log_file.write(cleaned_payload+'\n')
                log_file.flush()

            except Exception as e:
                sys.stderr.write('Error while running payload "{}": {}\n'.format(payload, e))
                sys.stderr.flush()

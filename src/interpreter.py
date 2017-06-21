import sys
import json
from itertools import izip, starmap, izip_longest, repeat
from datetime import datetime

class FlowsheetsJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        try:
            return json.dumps(obj)
        except:
            d = {}
            for key in dir(obj):
                if key.startswith('__'):
                    continue
                try:
                    d[key] = json.dumps(getattr(obj, key, None))
                except:
                    d[key] = repr(getattr(obj, key, None))
            d['repr'] = repr(obj)
            return d

def stringify(obj):
    return json.dumps(obj, sort_keys=True, cls=FlowsheetsJSONEncoder)

def starfilter(filter_expression, args_iterable, map_expression_result_iterable):
    # _c_filter_function(c_,   a_,b_) = ...
    # c = starfilter(  _c_filter_function,   izip(d,e),         starmap(_c_function, izip(a,b)) )
    # c = starfilter(  _c_filter_function,   izip(d,e),         a.split('\n') )

    empty = tuple()
    for args, result in izip_longest(args_iterable, map_expression_result_iterable):
        if filter_expression(result, *(args or empty)):
            yield result

user_globals = {
    'stringify':    stringify,
    'izip':         izip,
    'starmap':      starmap,
    'starfilter':   starfilter,
    '_iter_repeat': repeat,
}

with open(str(datetime.now())+'.txt', 'wb') as log_file:

    while True:

        # I would use sys.stdin.readline() here, but it seems like there's a bug where
        # if input is being sent in too fast then readlines takes incoming pieces instead of
        # separating by new line.

        accumulating_payload = [] 
        next_character = sys.stdin.read(1)
        # Data format is one line per command, with newlines within a command displayed as __NEWLINE__
        while next_character != '\n':
            accumulating_payload.append(next_character)
            next_character = sys.stdin.read(1) # Note: I believe the program execution is paused while waiting for the next character.

        payload = ''.join(accumulating_payload)
        # payload = '__EXEC:a = 1'
        # payload = '__EVAL:json.dumps(a)'

        # payload = '__EXEC:def _b_function():__NEWLINE__x = 5__NEWLINE__return x'
        # payload = '__EXEC:b = _b_function()'
        # payload = '__EVAL:json.dumps(b)'

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


            except Exception as e:
                sys.stderr.write('{}\n'.format(e))
                sys.stderr.flush()

            log_file.write(cleaned_payload+'\n')
            log_globals = {key: value for key,value in user_globals.iteritems() if key not in ('__builtins__', 'stringify', 'izip', 'starmap', 'starfilter', '_iter_repeat')}
            # log_file.write('current globals: {}\n'.format(log_globals))
            log_file.flush()
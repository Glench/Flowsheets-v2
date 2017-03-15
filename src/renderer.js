// @flow

const $ = require('jquery');
const _ = require('underscore');
const React = require('react');
const ReactDOM = require('react-dom');
const CodeMirror = require('codemirror');
require('codemirror/mode/python/python');

// @Cleanup: probably move to utils at some point
function clamp(num: number, min: number, max: number):number {
    if (num < min) {
        return min
    } else if (num > max) {
        return max
    }
    return num;
}

const visualizations = require('./visualizations')
const interpreter = require('./interpreter')
const Block = interpreter.Block;


var ui_blocks: UIBlock[] = [];
module.exports.ui_blocks = ui_blocks;

class UIBlock {
    row: number;
    column: number;

    should_auto_resize: boolean;
    width_in_columns: number;

    name_height: number; // in # of rows, not pixels
    code_height: number; // in # of rows, not pixels
    filter_clause_height: number; // in # of rows, not pixels
    output_height: number; // in # of rows, not pixels

    block: Block;

    visualization: any; // should be React.Component, but @flow is awful

    constructor() {
        this.should_auto_resize = true;
        this.width_in_columns = 1;

        this.name_height = 1;
        this.code_height = 1;
        this.filter_clause_height = 0;
        this.output_height = 1;
    }
};
module.exports.UIBlock = UIBlock;

const rows = 100
const columns = 30;
const cell_width = 88; // including borders
const cell_height = 19; // including borders
module.exports.cell_height = cell_height;

class Move_Drag {
    start_x: number;
    start_y: number;

    ui_block: UIBlock;

    is_dragging(x:number, y:number):boolean {
        var dx = Math.abs(this.start_x - x);
        var dy = Math.abs(this.start_y - y);
        return Math.max(dx, dy) > 3;
    }
}

class Resize_Drag {
    x: number;
    y: number;
    ui_block: UIBlock;
    original_width_in_columns: number;
    original_output_height: number;
}

class Resize_Code_Drag {
    start_row: number;
    ui_block: UIBlock;
}

var resize_drag: ?Resize_Drag = null;
var move_drag: ?Move_Drag = null;
var resize_code_drag: ?Resize_Code_Drag = null;


function initialize() {
    initialize_grid();

    $('#new-import').on('click', function(evt) {
        create_and_render_import();
    })
}
module.exports.initialize = initialize;

function initialize_grid() {
    var $main = $('canvas#main')
    var height = rows*cell_height;
    var width = columns*cell_width;
    var canvas = $main.get(0)

    canvas.width = width;
    canvas.height = height;

    var ctx = canvas.getContext('2d');

    ctx.translate(0.5, 0.5);
    for (var row = 0; row < rows; ++row) {
        // draw rows horizontally
        ctx.beginPath();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.moveTo(0, row*cell_height);
        ctx.lineTo(width, row*cell_height);
        ctx.stroke();
        ctx.closePath();
    }

    for (var column = 0; column < columns; ++column) {
        ctx.beginPath();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.moveTo(column*cell_width, 0);
        ctx.lineTo(column*cell_width, height);
        ctx.stroke();
        ctx.closePath();
    }
    ctx.translate(-0.5, -0.5);


    $main.on('click', function(evt) {
        var column = Math.floor((evt.offsetX-2) / cell_width);
        var row = Math.floor((evt.offsetY-2) / cell_height);

        var block = interpreter.create_block(null, '1+1');
        create_and_render_block(block, row, column);
    });

    $('body').on('mouseup', reset_dragging);

    $('body').on('mousemove', function(evt) {
        if (resize_drag) {
            resize_drag.ui_block.should_auto_resize = false;

            var dx = evt.pageX - resize_drag.x;
            var dy = evt.pageY - resize_drag.y;

            var new_columns = Math.floor(dx/cell_width);
            if (dx % cell_width > cell_width/3) {
                new_columns = Math.ceil(dx/cell_width);
            }
            resize_drag.ui_block.width_in_columns = clamp(resize_drag.original_width_in_columns + new_columns, 1, columns);

            var new_rows = Math.floor(dy/cell_height);
            if (dy % cell_height > cell_height/3) {
                new_rows = Math.ceil(dy/cell_height);
            }
            resize_drag.ui_block.output_height = clamp(resize_drag.original_output_height + new_rows, 1, rows);

            resize(resize_drag.ui_block)
        } else if (move_drag) {
            if (move_drag.is_dragging(evt.pageX, evt.pageY)) {
                var offset = $('#main').offset();
                var x_wrt_grid = evt.pageX - offset.left + 1;
                var y_wrt_grid = evt.pageY - offset.top + 1;

                move_drag.ui_block.row = clamp(Math.floor(y_wrt_grid / cell_height), 0, rows);
                move_drag.ui_block.column = clamp(Math.floor(x_wrt_grid / cell_width), 0, columns);

                resize(move_drag.ui_block)
            }
        } else if (resize_code_drag) {
            var y_wrt_grid = (evt.pageY - $('#main').offset().top) + 1;
            var ui_block = resize_code_drag.ui_block;

            resize_code_drag.ui_block.code_height = clamp(Math.ceil((y_wrt_grid - (ui_block.row+ui_block.name_height)*cell_height)/ cell_height)-1, 1, rows); // @Cleanup should be rows-block height
            resize(resize_code_drag.ui_block)
        }
    });
}

function create_and_render_import() {
    var $input = $('<input>').attr('class', 'import');
    $input.on('change', function(evt) {
        interpreter.python_import(evt.target.value)
    })
    $('#imports').append($input)
    $input.focus();
}

function reset_dragging(evt) {
    if (!resize_drag && !move_drag && !resize_code_drag) {
        return
    }
    evt.preventDefault();
    $('body').css('cursor', 'inherit');
    $('input').css('cursor', 'inherit')
    resize_drag = null;
    move_drag = null;
    resize_code_drag = null;
}

function create_and_render_block(block: Block, row: number, column: number) {
    var ui_block = new UIBlock();
    ui_block.row = row;
    ui_block.column = column;
    ui_block.block = block;
    ui_blocks.push(ui_block)

    var $block = $('<div>').attr('id', 'block-'+block.name).attr('class', 'block')
    $block.css({
        top: row*cell_height + 1,
        left: column*cell_width + 1,  
        height: 3*cell_height-1,
        width: cell_width-1,
    })

    // menu button
    var $menu_button = $('<div class="menu-button">').text('🔽').on('click', function(evt) {
        var $current_menu = $block.find('.menu, .submenu')
        if ($current_menu.length) {
            $current_menu.remove();
            return
        }

        var $menu = $('<ul class="menu">');

        var $delete = $('<li>').text('Delete (todo)').on('click', function(evt) {
            delete_(ui_block);
            interpreter.delete_(block);
        });
        $menu.append($delete);

        var $make_string = $('<li>').html(block.is_string_concat ? 'Make string&nbsp;✔' : 'Make string').on('click', function(evt) {
            var $make_string = $(evt.target);
            if (!block.is_string_concat) {
                block.is_string_concat = true;
                $block.find('.code .CodeMirror').addClass('is_string_concat')
            } else {
                block.is_string_concat = false;
                $make_string.text('Make string')
                $block.find('.code .CodeMirror').removeClass('is_string_concat')
            }
            $block.find('.menu, .submenu').remove();

        });
        $menu.append($make_string)

        var text = block.filter_clause ? 'Remove Filter' : 'Add Filter';
        var $filter = $('<li>').text(text).on('click', function(evt) {
            $block.find('.menu, .submenu').remove();
            if (block.filter_clause) {
                interpreter.remove_filter_clause(block);

                $block.find('.filter_clause').hide();
                ui_block.filter_clause_height = 0;
                resize(ui_block);

                return
            }
            var cm = $block.find('.filter_clause').show().find('.CodeMirror').get(0).CodeMirror;
            cm.refresh();
            cm.focus();
            block.filter_clause = 'True'
            ui_block.filter_clause_height = 1;

            resize(ui_block);
        });
        $menu.append($filter);

        var $viz = $('<li>').html('Visualization&nbsp;&nbsp;▶').on('mouseenter', function(evt) {
            $block.find('.submenu').remove(); // remove old ones if they're still around

            var $submenu = $('<ul class="submenu">').css({
                left: $menu.width() + 7,
                top: 30,
            });
            $block.append($submenu);

            _.each(visualizations, function(react_component, name) {
                var text = react_component === ui_block.visualization || (!ui_block.visualization && name == 'DefaultViz') ? name+'︎&nbsp;✔' : name;
                var $li = $('<li>').html(text).on('click', function(evt) {
                    $block.find('.menu, .submenu').remove();
                    ui_block.visualization = react_component;
                    render_output(block);
                });
                $submenu.append($li)
            })
        }).on('mouseleave', function(evt) {
            // $block.find('.submenu').remove();
        });
        $menu.append($viz);

        $block.prepend($menu)
    });
    $block.append($menu_button)

    // name
    var $name = $('<div class="name">')
    $name.append($('<input>').attr('value', block.name).attr('readOnly', true).on('change', function(evt) {
          var old_name = block.name;
          var new_name = interpreter.change_name(block, evt.target.value);

          var $input = $(evt.target);
          $input.val(new_name); // rewrite in case the name changed because of sanitization
          $input.blur(); 
          $input.attr('readOnly', true)

          $input.parents('.block').attr('id', 'block-'+new_name)

    }).on('mousedown', function(evt) {
        evt.preventDefault();
        move_drag = new Move_Drag();
        move_drag.ui_block = ui_block;
        move_drag.start_x = evt.pageX;
        move_drag.start_y = evt.pageY;
        $('body').css('cursor', 'move');
        $(evt.target).css('cursor', 'move');
    }).on('dblclick', function(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        move_drag = null;
        $(evt.target).css('cursor', 'inherit');

        // edit name
        var $target = $(evt.target);
        $target.removeAttr('readOnly')
        $target.focus();
        $target.select();
    }) );
    $block.append($name);


    function make_codemirror(element:HTMLElement, code:string, ui_block_cell_name: string, update_func: Function) {
        var codemirror = CodeMirror(element, {
            value: code,
            mode: 'python',
            autofocus: true,
            tabSize: 2,
            extraKeys: {
                'Enter': function(instance) {
                    var code = instance.getValue()
                    if (!_.includes(code, '\n')) {
                        // if user presses enter when no newlines, run the code, otherwise put in newline
                        update_func(block, code)
                    } else {
                        if (ui_block.should_auto_resize) {
                            var _ui_block:Object = ui_block; // stupid @flow workaround: https://github.com/facebook/flow/issues/1730
                            _ui_block[ui_block_cell_name] = _.filter(code, x => x == '\n').length+2
                            resize(ui_block);
                        }
                        instance.replaceSelection('\n')
                    }
                },
                'Ctrl-Enter': function(instance) {
                    var code = instance.getValue()
                    if (_.includes(code, '\n')) {
                        // if user presses ctrl-enter when there are newlines, run the code
                        update_func(block, code)
                    } else {
                        if (ui_block.should_auto_resize) {
                            var _ui_block:Object = ui_block; // stupid @flow workaround: https://github.com/facebook/flow/issues/1730
                            _ui_block[ui_block_cell_name] = _.filter(code, x => x == '\n').length+2
                            resize(ui_block);
                        }
                        instance.replaceSelection('\n')
                    }
                },
                'Tab': function(instance) {
                    var current_place = instance.getCursor();
                    var current_line = instance.getLine(current_place.line);
                    if (current_place.ch == current_line.length && !current_line.match(/^\s*$/)) {
                        var new_block = interpreter.create_block(null, '1+1')
                        create_and_render_block(new_block, ui_block.row, ui_block.column + ui_block.width_in_columns)
                    } else {
                        instance.replaceSelection('  ') // @Robustness: should use codemirror tab options to do this
                    }
                },
            }
        });
        codemirror.setSelection({line: 0, ch: 0}, {line: Infinity, ch: Infinity}); // highlight all code
        codemirror.on('change', function(instance) {
            // resize block automatically
            if (ui_block.should_auto_resize) {
                var code = instance.getValue();
                var _ui_block:Object = ui_block; // stupid @flow workaround: https://github.com/facebook/flow/issues/1730
                _ui_block[ui_block_cell_name] = _.filter(code, x => x == '\n').length+1;

                // make block width equal to the number of characters that will fit in a cell,
                var number_of_characters_that_will_fit_in_a_cell = 10.5;
                // make block's size fit the longest line in a code editor
                ui_block.width_in_columns = clamp(Math.ceil(_.last(_.sortBy(code.split('\n'), line => line.length)).length / number_of_characters_that_will_fit_in_a_cell), 1, 8);
                resize(ui_block);
            }

            // render references
            try {
                var marks = instance.getAllMarks();
                marks.forEach(mark => mark.clear()); // destroy and recreate all codemirror marks

                var positions = interpreter.get_user_identifiers_with_positions(instance.getValue());
                positions.forEach(position => {
                    var element = $('<span class="flowsheets-reference">').text(position.name).on('mouseenter', function(evt) {
                        var $reference_block = $('#block-'+position.name)
                        if (!$reference_block.length) {
                            $reference_block = $('#block-'+position.name.slice(0,position.name.length-1))
                        }
                        $reference_block.addClass('flowsheets-highlighted')
                    }).on('mouseleave', function(evt) {
                        var $reference_block = $('#block-'+position.name)
                        if (!$reference_block.length) {
                            $reference_block = $('#block-'+position.name.slice(0,position.name.length-1))
                        }
                        $reference_block.removeClass('flowsheets-highlighted')
                    }).get(0)

                    instance.markText(
                        {line: position.start_line, ch: position.start_ch},
                        {line: position.end_line, ch: position.end_ch},
                        {replacedWith: element}
                     )
                })
            } catch(e) {
                // almost certainly a python parse error in filbert from get_user_identifiers_with_positions
            }
        });
        codemirror.on('blur', function(instance, evt) {
            instance.setSelection({line:0, ch:0})
        });
        codemirror.on('cursorActivity', function(instance) {
            var selection = instance.getSelection();
            if (selection) {
                var $code = $(element);
                $code.find('.flowsheets-code-selection').remove();

                $code.append($('<div class="flowsheets-code-selection">➡️</div>').on('mousedown', function(evt) {
                    var new_block = interpreter.create_block(null, selection);
                    create_and_render_block(new_block, ui_block.row, ui_block.column+ui_block.width_in_columns);

                    instance.replaceSelection(new_block.name);

                    interpreter.change_code(block, instance.getValue());
                }) )
            } else {
                $(element).find('.flowsheets-code-selection').remove();
            }
        })

        return codemirror;
    };

    // code
    var $code = $('<div class="code">')
    var code_mirror = make_codemirror($code.get(0), block.code, 'code_height', interpreter.change_code);
    $block.append($code)


    // code resizer
    var $code_resizer = $('<div class="code-resizer">');
    $code_resizer.on('mousedown', function(evt) {
        evt.preventDefault();

        $('body').css('cursor', 'ns-resize');
        ui_block.should_auto_resize = false;

        resize_code_drag = new Resize_Code_Drag();
        resize_code_drag.start_row = ui_block.row + ui_block.code_height;
        resize_code_drag.ui_block = ui_block;
    })
    $block.append($code_resizer)


    // filter clause
    var $filter_clause = $('<div class="filter_clause">').hide();
    var filter_codemirror = make_codemirror($filter_clause.get(0), 'True', 'filter_clause_height', interpreter.change_filter_clause);
    $block.append($filter_clause);

    // @TODO: need to add resizer UI for filter clause

    // output
    var $output = $('<div class="output">');
    $output.on('scroll', function(evt) {
        var scroll_top = evt.target.scrollTop;
        interpreter.blocks.forEach(function(test_block) {
            if (test_block.depends_on.includes(block)) {
                $('#block-'+test_block.name).find('.output').scrollTop(scroll_top)
            }
        });
    })
    $output.append($('<input>').attr('value', block.output).on('click', function(evt) {
        evt.stopPropagation();
    }));
    $block.append($output)


    // resize handle
    var $resize = $('<div class="resize-handle">')
    $resize.on('mousedown', function(evt) {
        evt.preventDefault();

        resize_drag = new Resize_Drag();
        resize_drag.x = evt.pageX;
        resize_drag.y = evt.pageY;
        resize_drag.ui_block = ui_block;
        resize_drag.original_width_in_columns = ui_block.width_in_columns;
        resize_drag.original_output_height = ui_block.output_height;

        $('body').css('cursor', 'nwse-resize');
    }).on('mouseup', reset_dragging);
    $block.append($resize)

    $('#blocks').append($block);

    code_mirror.refresh(); // refresh in order to make text show up properly
};
module.exports.create_and_render_block = create_and_render_block;

function render_code(block: Block) {
    var $code_input = $('#block-'+block.name).find('.code .CodeMirror');
    $code_input.get(0).CodeMirror.setValue(block.code)
    fade_background_color($code_input, 1, 'rgba(220,220,220, ')
}
module.exports.render_code = render_code;

function render_filter_clause(block: Block) {
    var $filter_input = $('#block-'+block.name).find('.filter_clause .CodeMirror');
    $filter_input.get(0).CodeMirror.setValue(block.filter_clause)
    fade_background_color($filter_input, 1, 'rgba(220,220,220, ')
}
module.exports.render_filter_clause = render_filter_clause;

function render_error(block: Block) {
    var $output = $('#block-'+block.name).find('.output input')
    if (block.error) {
        $output.val(block.error)    
        $output.css('background-color', '#f00')
    } else {
        $output.css('background-color', 'inherit')
    }
}
module.exports.render_error = render_error;

function resize(ui_block: UIBlock) {
    var $block = $('#block-'+ui_block.block.name)

    $block.css({
        top: ui_block.row*cell_height + 1,
        left: ui_block.column*cell_width + 1,
        width: ui_block.width_in_columns*cell_width - 1,
        height: cell_height*(ui_block.name_height+ui_block.code_height+ui_block.filter_clause_height+ui_block.output_height) - 1,
    })

    $block.find('.code').css('height', cell_height*ui_block.code_height - 1);
    $block.find('.filter_clause').css('height', cell_height*ui_block.filter_clause_height - 1);
    $block.find('.output').css('height', cell_height*ui_block.output_height - 2);
}

function render_output(block: Block) {
    var ui_block = ui_blocks.filter(ui_block => ui_block.block === block)[0];

    if (ui_block.should_auto_resize) {
        if (_.isArray(block.output) && _.isObject(block.output)) {
            ui_block.output_height = clamp(_.size(block.output), 1, 40)
        } else {
            ui_block.output_height = 1;
        }
    }
    var visualization = ui_block.visualization ? ui_block.visualization : visualizations.DefaultViz;
    try {
        ReactDOM.render(React.createElement(visualization, {
            block: block,
            ui_block: ui_block,
        }), document.querySelector('#block-'+block.name+' .output'))

    } catch(e) {
        block.error = 'Error in visualization: '+e;
        render_error(block)
    }
    resize(ui_block)
};
module.exports.render_output = render_output;

function delete_(ui_block: UIBlock) {
    $('#block-'+ui_block.block.name).remove();
    ui_blocks = _.reject(ui_blocks, ui_block_to_reject => ui_block_to_reject === ui_block) 
}

function fade_background_color($element, alpha:number, color:string) {
    if (color[3] !== 'a') { throw 'Color needs to start with "rgba"'}
    alpha -= .04
    if (alpha < 0) {
        $element.css('background-color', 'transparent')
        return
    }
    var new_color = color.replace(' ', ` ${alpha})`)
    $element.css('background-color', new_color)
    setTimeout(fade_background_color, 1000/60, $element, alpha, color);
}

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

    name_height: number; // in # of rows
    code_height: number; // in # of rows
    output_height: number; // in # of rows

    block: Block;

    visualization: any; // should be React.Component, but @flow is awful

    constructor() {
        this.should_auto_resize = true;
        this.width_in_columns = 1;

        this.name_height = 1;
        this.code_height = 1;
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

var resize_drag: ?Resize_Drag = null;
var move_drag: ?Move_Drag = null;


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
                var grid = document.querySelector('#main');
                if (!grid) { return; } // extraneous code for @flow
                var x_wrt_grid = evt.pageX - grid.getBoundingClientRect().left + 1;
                var y_wrt_grid = evt.pageY - grid.getBoundingClientRect().top + 1;

                // @Cleanup
                move_drag.ui_block.row = clamp(Math.floor(y_wrt_grid / cell_height), 0, rows);
                move_drag.ui_block.column = clamp(Math.floor(x_wrt_grid / cell_width), 0, columns);

                resize(move_drag.ui_block)
            }
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
    if (!resize_drag && !move_drag) {
        return
    }
    evt.preventDefault();
    $('body').css('cursor', 'inherit');
    $('input').css('cursor', 'inherit')
    resize_drag = null;
    move_drag = null;
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

        var $delete = $('<li>').text('Delete').on('click', function(evt) {
            delete_(ui_block);
            interpreter.delete_(block);
        });
        $menu.append($delete);

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


    // code
    var $code = $('<div class="code">')
    var codemirror = CodeMirror($code.get(0), {
        value: block.code,
        mode: 'python',
        autofocus: true,
        tabSize: 2,
        extraKeys: {
            'Enter': function(instance) {
                var code = instance.getValue()
                if (!_.includes(code, '\n')) {
                    // if user presses enter when no newlines, run the code, otherwise put in newline
                    interpreter.change_code(block, code)
                } else {
                    if (ui_block.should_auto_resize) {
                        ui_block.code_height = _.filter(code, x => x == '\n').length+2
                        resize(ui_block);
                    }
                    instance.replaceSelection('\n')
                }
            },
            'Ctrl-Enter': function(instance) {
                var code = instance.getValue()
                if (_.includes(code, '\n')) {
                    // if user presses ctrl-enter when there are newlines, run the code
                    interpreter.change_code(block, code)
                } else {
                    if (ui_block.should_auto_resize) {
                        ui_block.code_height = _.filter(code, x => x == '\n').length+2
                        resize(ui_block);
                    }
                    instance.replaceSelection('\n')
                }
            },
        }
    });
    codemirror.setSelection({line: 0, ch: 0}, {line: Infinity, ch: Infinity}); // highlight all code
    codemirror.on('change', function(instance) {
        if (ui_block.should_auto_resize) {
            var code = instance.getValue();
            ui_block.code_height = _.filter(code, x => x == '\n').length+1;

            // make block width equal to the number of characters that will fit in a cell,
            var number_of_characters_that_will_fit_in_a_cell = 10.5;
            ui_block.width_in_columns = clamp(Math.ceil(_.last(_.sortBy(code.split('\n'), line => line.length)).length / number_of_characters_that_will_fit_in_a_cell), 1, columns);
            resize(ui_block);
        }
    })
    codemirror.on('blur', function(instance, evt) {
        instance.setSelection({line:0, ch:0})
    })
    $block.append($code);


    // output
    var $output = $('<div class="output">');
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

    // code editor
    codemirror.refresh();
};
module.exports.create_and_render_block = create_and_render_block;

function render_code(block: Block) {
    var $code_input = $('#block-'+block.name).find('.code .CodeMirror');
    $code_input.get(0).CodeMirror.setValue(block.code)
    fade_background_color($code_input, 1, 'rgba(220,220,220, ')
}
module.exports.render_code = render_code;

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
        height: cell_height*(ui_block.name_height+ui_block.code_height+ui_block.output_height) - 1,
    })

    $block.find('.code').css('height', cell_height*ui_block.code_height - 1);
    $block.find('.output').css('height', cell_height*ui_block.output_height - 1);
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

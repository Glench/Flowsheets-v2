const $ = require('jquery');
const _ = require('underscore');
const React = require('react');
const ReactDOM = require('react-dom');
const CodeMirror = require('codemirror');
require('codemirror/mode/python/python');
require('codemirror/mode/javascript/javascript');

const rows = 300;
const columns = 30;
const cell_width = 88; // including borders
const cell_height = 19; // including borders
module.exports.cell_height = cell_height;

// @Cleanup: probably move to utils at some point
function clamp(num, min, max) {
    if (num < min) {
        return min;
    } else if (num > max) {
        return max;
    }
    return num;
}

const visualizations = require('./visualizations');
const interpreter = require('./interpreter');
const Block = interpreter.Block;
const Import = interpreter.Import;

var ui_blocks = [];
module.exports.ui_blocks = ui_blocks;

class UIBlock {
    // should be React.Component, but  is awful

    // in # of rows, not pixels
    // in # of rows, not pixels
    // in # of rows, not pixels
    constructor() {
        this.should_auto_resize = true;
        this.width_in_columns = 1;

        this.name_height = 1;
        this.code_height = 1;
        this.filter_clause_height = 0;
        this.sort_clause_height = 0;
        this.output_height = 1;
        this.visualization = visualizations.DefaultViz;
        this.visualization_options_height = 0;
    } // should be React.Component, but  is awful
    // in # of rows, not pixels
    // in # of rows, not pixels
};
module.exports.UIBlock = UIBlock;

class Move_Drag {

    is_dragging(x, y) {
        var dx = Math.abs(this.start_x - x);
        var dy = Math.abs(this.start_y - y);
        return Math.max(dx, dy) > 3;
    }
}

class Resize_Drag {}

class Resize_Code_Drag {}

var resize_drag = null;
var move_drag = null;
var resize_code_drag = null;

function initialize() {
    initialize_grid();
    // initialize_sidebar();

    $('#new-import').on('click', function (evt) {
        create_and_render_import();
    });
}
module.exports.initialize = initialize;

function initialize_grid() {
    var $main = $('canvas#main');
    var height = rows * cell_height;
    var width = columns * cell_width;
    var canvas = $main.get(0);

    canvas.width = width;
    canvas.height = height;

    var ctx = canvas.getContext('2d');

    ctx.translate(0.5, 0.5);
    for (var row = 0; row < rows; ++row) {
        // draw rows horizontally
        ctx.beginPath();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.moveTo(0, row * cell_height);
        ctx.lineTo(width, row * cell_height);
        ctx.stroke();
        ctx.closePath();
    }

    for (var column = 0; column < columns; ++column) {
        ctx.beginPath();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.moveTo(column * cell_width, 0);
        ctx.lineTo(column * cell_width, height);
        ctx.stroke();
        ctx.closePath();
    }
    ctx.translate(-0.5, -0.5);

    $main.on('click', function (evt) {
        var column = Math.floor((evt.offsetX - 2) / cell_width);
        var row = Math.floor((evt.offsetY - 2) / cell_height);

        var block = interpreter.create_block(null, '1+1');
        create_and_render_block(block, row, column);
    });

    $('body').on('mouseup', reset_dragging);

    $('body').on('mousemove', function (evt) {
        if (resize_drag) {
            var ui_block = resize_drag.ui_block;
            ui_block.should_auto_resize = false;

            var dx = evt.pageX - resize_drag.x;
            var dy = evt.pageY - resize_drag.y;

            var new_columns = Math.floor(dx / cell_width);
            if (dx % cell_width > cell_width / 3) {
                new_columns = Math.ceil(dx / cell_width);
            }
            ui_block.width_in_columns = clamp(resize_drag.original_width_in_columns + new_columns, 1, columns);

            var new_rows = Math.floor(dy / cell_height);
            if (dy % cell_height > cell_height / 3) {
                new_rows = Math.ceil(dy / cell_height);
            }
            var previous_output_height = ui_block.output_height;
            ui_block.output_height = clamp(resize_drag.original_output_height + new_rows, 1, rows);

            if (ui_block.output_height > previous_output_height) {
                render_visualization(ui_block, ui_block.visualization);
            }
            resize(ui_block);
        } else if (move_drag) {
            if (move_drag.is_dragging(evt.pageX, evt.pageY)) {
                var offset = $('#main').offset();
                var x_wrt_grid = evt.pageX - offset.left + 1;
                var y_wrt_grid = evt.pageY - offset.top + 1;

                move_drag.ui_block.row = clamp(Math.floor(y_wrt_grid / cell_height), 0, rows);
                move_drag.ui_block.column = clamp(Math.floor(x_wrt_grid / cell_width), 0, columns);

                resize(move_drag.ui_block);
            }
        } else if (resize_code_drag) {
            var y_wrt_grid = evt.pageY - $('#main').offset().top + 1;
            var ui_block = resize_code_drag.ui_block;

            resize_code_drag.ui_block.code_height = clamp(Math.ceil((y_wrt_grid - (ui_block.row + ui_block.name_height) * cell_height) / cell_height) - 1, 1, rows); // @Cleanup should be rows-block height
            resize(resize_code_drag.ui_block);
        }
    });
}

function initialize_sidebar() {
    var $visualization_editor = $('<div class="visualization_editor">');

    var code = `class CustomViz extends React.Component {
  constructor(props) {
    super(props);
  }
  flash() {
    this.refs.container.style.backgroundColor = 'yellow';
    setTimeout(()=> this.refs.container.style.backgroundColor = 'transparent', 300);
  }
  componentDidUpdate(props) {
    this.flash();
  }
  componentDidMount() {
    this.flash();
  }
  render() {
    return React.createElement('div', {ref: 'container'}, this.props.block.output)
  }
}`;

    var codemirror = CodeMirror($visualization_editor.get(0), {
        value: code,
        mode: 'javascript',
        tabSize: 2,
        extraKeys: {
            'Ctrl-Enter': function (instance) {
                var old_CustomViz = visualizations.CustomViz;
                try {

                    var CustomViz = eval(instance.getValue());
                    $visualization_editor.css({ backgroundColor: 'white' });
                } catch (e) {
                    $visualization_editor.css({ backgroundColor: '#ffa9a9' });
                    return;
                }
                visualizations.CustomViz = CustomViz;
                ui_blocks.forEach(function (ui_block) {
                    if (ui_block.visualization && ui_block.visualization === old_CustomViz) {
                        ui_block.visualization = CustomViz;
                        render_output(ui_block.block);
                    }
                });
            }
        }
    });

    $visualization_editor.prepend('<h2>Edit Visualization</h2>');

    $('#sidebar').append($visualization_editor);
}

function create_and_render_import() {
    var import_ = interpreter.create_import('');

    var $input = $('<input>').attr('class', 'import');
    $input.on('change', function (evt) {
        interpreter.change_import_code(import_, evt.target.value);
    });
    $('#imports').append($input);
    $input.focus();
}

function reset_dragging(evt) {
    if (!resize_drag && !move_drag && !resize_code_drag) {
        return;
    }
    evt.preventDefault();
    $('body').css('cursor', 'inherit');
    $('input').css('cursor', 'inherit');
    resize_drag = null;
    move_drag = null;
    resize_code_drag = null;
}

function create_and_render_block(block, row, column) {
    var ui_block = new UIBlock();
    ui_block.row = row;
    ui_block.column = column;
    ui_block.block = block;
    ui_blocks.push(ui_block);

    var $block = $('<div>').attr('id', 'block-' + block.name).attr('class', 'block');
    $block.css({
        top: row * cell_height + 1,
        left: column * cell_width + 1,
        height: 3 * cell_height - 1,
        width: cell_width - 1
    });

    // menu button
    var $menu_button = $('<div class="menu-button">').text('🔽').on('click', function (evt) {
        var $current_menu = $block.find('.menu, .submenu');
        if ($current_menu.length) {
            $current_menu.remove();
            return;
        }

        var $menu = $('<ul class="menu">');

        var $delete = $('<li>').text('Delete (todo)').on('click', function (evt) {
            delete_(ui_block);
            interpreter.delete_(block);
        });
        $menu.append($delete);

        var $make_string = $('<li>').html(block.is_string_concat ? 'Make string&nbsp;✔' : 'Make string').on('click', function (evt) {
            var $make_string = $(evt.target);
            if (!block.is_string_concat) {
                block.is_string_concat = true;
                $block.find('.code .CodeMirror').addClass('is_string_concat');
            } else {
                block.is_string_concat = false;
                $make_string.text('Make string');
                $block.find('.code .CodeMirror').removeClass('is_string_concat');
            }
            $block.find('.menu, .submenu').remove();
        });
        $menu.append($make_string);

        var text = block.filter_clause ? 'Remove Filter' : 'Add Filter';
        var $filter = $('<li>').text(text).on('click', function (evt) {
            $block.find('.menu, .submenu').remove();
            if (block.filter_clause) {
                interpreter.remove_filter_clause(block);

                $block.find('.filter_clause').hide();
                ui_block.filter_clause_height = 0;
                resize(ui_block);

                return;
            }
            var cm = $block.find('.filter_clause').show().find('.CodeMirror').get(0).CodeMirror;
            cm.refresh();
            cm.focus();
            block.filter_clause = 'True';
            ui_block.filter_clause_height = 1;

            resize(ui_block);
        });
        $menu.append($filter);

        var text = block.sort_clause ? 'Remove Sort' : 'Add Sort (todo)';
        var $sort = $('<li>').text(text).on('click', function (evt) {
            $block.find('.menu, .submenu').remove();
            if (block.sort_clause) {
                interpreter.remove_sort_clause(block);

                $block.find('.sort_clause').hide();
                ui_block.sort_clause_height = 0;
                resize(ui_block);

                return;
            }
            var cm = $block.find('.sort_clause').show().find('.CodeMirror').get(0).CodeMirror;
            cm.refresh();
            cm.focus();
            block.sort_clause = block.name + '_';
            ui_block.sort_clause_height = 1;

            resize(ui_block);
        });
        $menu.append($sort);

        var $viz = $('<li>').html('Visualization&nbsp;&nbsp;▶').on('mouseenter', function (evt) {
            $block.find('.submenu').remove(); // remove old ones if they're still around

            var $submenu = $('<ul class="submenu">').css({
                left: $menu.width() + 7,
                top: 30
            });
            $block.append($submenu);

            _.each(visualizations, function (react_component, name) {
                var text = name;
                var $li = $('<li>').html(name == ui_block.visualization.name ? '✔&nbsp;' + name : name).on('click', function (evt) {
                    $block.find('.menu, .submenu').remove();
                    ui_block.visualization = react_component;
                    render_output(block);
                });
                $submenu.append($li);
            });
        }).on('mouseleave', function (evt) {
            // $block.find('.submenu').remove();
        });
        $menu.append($viz);

        $block.prepend($menu);
    });
    $block.append($menu_button);

    // name
    var $name = $('<div class="name">');
    $name.append($('<input>').attr('value', block.name).attr('readOnly', true).on('change', function (evt) {
        var old_name = block.name;
        var new_name = interpreter.change_name(block, evt.target.value);

        var $input = $(evt.target);
        $input.val(new_name); // rewrite in case the name changed because of sanitization
        $input.blur();
        $input.attr('readOnly', true);

        $input.parents('.block').attr('id', 'block-' + new_name);
    }).on('mousedown', function (evt) {
        evt.preventDefault();
        move_drag = new Move_Drag();
        move_drag.ui_block = ui_block;
        move_drag.start_x = evt.pageX;
        move_drag.start_y = evt.pageY;
        $('body').css('cursor', 'move');
        $(evt.target).css('cursor', 'move');
    }).on('dblclick', function (evt) {
        evt.stopPropagation();
        evt.preventDefault();
        move_drag = null;
        $(evt.target).css('cursor', 'inherit');

        // edit name
        var $target = $(evt.target);
        $target.removeAttr('readOnly');
        $target.focus();
        $target.select();
    }));
    $block.append($name);

    function make_codemirror(element, code, ui_block_cell_name, update_func) {
        var codemirror = CodeMirror(element, {
            value: code,
            mode: 'python',
            autofocus: true,
            tabSize: 2,
            extraKeys: {
                'Enter': function (instance) {
                    var code = instance.getValue();
                    if (!_.includes(code, '\n')) {
                        // if user presses enter when no newlines, run the code, otherwise put in newline
                        update_func(block, code);
                    } else {
                        if (ui_block.should_auto_resize) {
                            var _ui_block = ui_block; // stupid  workaround: https://github.com/facebook/flow/issues/1730
                            _ui_block[ui_block_cell_name] = _.filter(code, x => x == '\n').length + 2;
                            resize(ui_block);
                        }
                        instance.replaceSelection('\n');
                    }
                },
                'Ctrl-Enter': function (instance) {
                    var code = instance.getValue();
                    if (_.includes(code, '\n')) {
                        // if user presses ctrl-enter when there are newlines, run the code
                        update_func(block, code);
                    } else {
                        if (ui_block.should_auto_resize) {
                            var _ui_block = ui_block; // stupid  workaround: https://github.com/facebook/flow/issues/1730
                            _ui_block[ui_block_cell_name] = _.filter(code, x => x == '\n').length + 2;
                            resize(ui_block);
                        }
                        instance.replaceSelection('\n');
                    }
                },
                'Tab': function (instance) {
                    var current_place = instance.getCursor();
                    var current_line = instance.getLine(current_place.line);
                    if (current_place.ch == current_line.length && !current_line.match(/^\s*$/)) {
                        var new_block = interpreter.create_block(null, '1+1');
                        create_and_render_block(new_block, ui_block.row, ui_block.column + ui_block.width_in_columns);
                    } else {
                        instance.replaceSelection('  '); // @Robustness: should use codemirror tab options to do this
                    }
                }
            }
        });
        codemirror.setSelection({ line: 0, ch: 0 }, { line: Infinity, ch: Infinity }); // highlight all code
        codemirror.on('change', function (instance) {
            // resize block automatically
            if (ui_block.should_auto_resize) {
                var code = instance.getValue();
                var _ui_block = ui_block; // stupid  workaround: https://github.com/facebook/flow/issues/1730
                _ui_block[ui_block_cell_name] = clamp(_.filter(code, x => x == '\n').length + 1, 1, 30); // limit pasting in long strings

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
                    var element = $('<span class="flowsheets-reference">').text(position.name).on('mouseenter', function (evt) {
                        var $reference_block = $('#block-' + position.name);
                        if (!$reference_block.length) {
                            $reference_block = $('#block-' + position.name.slice(0, position.name.length - 1));
                        }
                        $reference_block.addClass('flowsheets-highlighted');
                    }).on('mouseleave', function (evt) {
                        var $reference_block = $('#block-' + position.name);
                        if (!$reference_block.length) {
                            $reference_block = $('#block-' + position.name.slice(0, position.name.length - 1));
                        }
                        $reference_block.removeClass('flowsheets-highlighted');
                    }).get(0);

                    instance.markText({ line: position.start_line, ch: position.start_ch }, { line: position.end_line, ch: position.end_ch }, { replacedWith: element });
                });
            } catch (e) {
                // almost certainly a python parse error in filbert from get_user_identifiers_with_positions
            }
        });
        codemirror.on('blur', function (instance, evt) {
            instance.setSelection({ line: 0, ch: 0 });
        });
        codemirror.on('cursorActivity', function (instance) {
            var selection = instance.getSelection();
            if (selection) {
                var $code = $(element);
                $code.find('.flowsheets-code-selection').remove();

                $code.append($('<div class="flowsheets-code-selection">➡️</div>').on('mousedown', function (evt) {
                    var new_block = interpreter.create_block(null, selection);
                    create_and_render_block(new_block, ui_block.row, ui_block.column + ui_block.width_in_columns);

                    instance.replaceSelection(new_block.name);
                    update_func(block, instance.getValue());
                }));
            } else {
                $(element).find('.flowsheets-code-selection').remove();
            }
        });

        return codemirror;
    };

    // code
    var $code = $('<div class="code">');
    var code_mirror = make_codemirror($code.get(0), block.code, 'code_height', interpreter.change_code);
    $block.append($code);

    // code resizer
    var $code_resizer = $('<div class="code-resizer">');
    $code_resizer.on('mousedown', function (evt) {
        evt.preventDefault();

        $('body').css('cursor', 'ns-resize');
        ui_block.should_auto_resize = false;

        resize_code_drag = new Resize_Code_Drag();
        resize_code_drag.start_row = ui_block.row + ui_block.code_height;
        resize_code_drag.ui_block = ui_block;
    });
    $block.append($code_resizer);

    // filter clause
    var $filter_clause = $('<div class="filter_clause">').hide();
    var filter_codemirror = make_codemirror($filter_clause.get(0), 'True', 'filter_clause_height', interpreter.change_filter_clause);
    $block.append($filter_clause);

    // @TODO: need to add resizer UI for filter clause

    // sort clause
    var $sort_clause = $('<div class="sort_clause">').hide();
    var sort_codemirror = make_codemirror($sort_clause.get(0), block.name + '_', 'sort_clause_height', interpreter.change_sort_clause);
    $block.append($sort_clause);

    // output
    var $output = $('<div class="output">');
    $block.append($output);

    var $visualization_options = $('<div class="visualization_options">');
    $block.append($visualization_options);

    // resize handle
    var $resize = $('<div class="resize-handle">');
    $resize.on('mousedown', function (evt) {
        evt.preventDefault();

        resize_drag = new Resize_Drag();
        resize_drag.x = evt.pageX;
        resize_drag.y = evt.pageY;
        resize_drag.ui_block = ui_block;
        resize_drag.original_width_in_columns = ui_block.width_in_columns;
        resize_drag.original_output_height = ui_block.output_height;

        $('body').css('cursor', 'nwse-resize');
    }).on('mouseup', reset_dragging);
    $block.append($resize);

    $('#blocks').append($block);

    code_mirror.refresh(); // refresh in order to make text show up properly
};
module.exports.create_and_render_block = create_and_render_block;

function render_code(block) {
    var $code_input = $('#block-' + block.name).find('.code .CodeMirror');
    $code_input.get(0).CodeMirror.setValue(block.code);
    fade_background_color($code_input, 1, 'rgba(220,220,220, ');
}
module.exports.render_code = render_code;

function render_filter_clause(block, old_name) {
    var block_html_name = old_name ? old_name : block.name;
    var $filter_input = $('#block-' + block_html_name).find('.filter_clause .CodeMirror');
    $filter_input.get(0).CodeMirror.setValue(block.filter_clause);
    fade_background_color($filter_input, 1, 'rgba(220,220,220, ');
}
module.exports.render_filter_clause = render_filter_clause;

function render_error(block) {
    var $output = $('#block-' + block.name).find('.output input');
    if (block.error) {
        $output.val(block.error);
        $output.css('background-color', '#f00');
    } else {
        $output.css('background-color', 'inherit');
    }
}
module.exports.render_error = render_error;

function render_import_error(import_) {
    var index = interpreter.imports.indexOf(import_);
    if (import_.error) {
        $('#imports input').eq(index).css({ backgroundColor: 'red', color: 'white' });
    } else {
        $('#imports input').eq(index).css({ backgroundColor: 'white', color: 'black' });
    }
}
module.exports.render_import_error = render_import_error;

function resize(ui_block) {
    var $block = $('#block-' + ui_block.block.name);

    $block.css({
        top: ui_block.row * cell_height + 1,
        left: ui_block.column * cell_width + 1,
        width: ui_block.width_in_columns * cell_width - 1,
        height: cell_height * (ui_block.name_height + ui_block.code_height + ui_block.filter_clause_height + ui_block.sort_clause_height + ui_block.output_height + ui_block.visualization_options_height) - 1
    });

    $block.find('.name input').width(cell_width * ui_block.width_in_columns - 7 /*padding*/);
    $block.find('.code').css('height', cell_height * ui_block.code_height - 1);
    $block.find('.filter_clause').css('height', cell_height * ui_block.filter_clause_height - 1);
    $block.find('.sort_clause').css('height', cell_height * ui_block.sort_clause_height - 1);
    $block.find('.output').css('height', cell_height * ui_block.output_height - 2);

    $block.find('.visualization_options').css('height', cell_height * ui_block.visualization_options_height - 1);
    if (ui_block.visualization_options_height == 0) {
        $block.find('.visualization_options').hide();
    } else {
        $block.find('.visualization_options').show();
    }
}

function render_output(block) {
    var ui_block = ui_blocks.filter(ui_block => ui_block.block === block)[0];

    if (ui_block.should_auto_resize) {
        if (_.isArray(block.output) && _.isObject(block.output)) {
            ui_block.output_height = clamp(_.size(block.output), 1, 30);
        } else {
            ui_block.output_height = 1;
        }
    }

    var visualization = ui_block.visualization;

    if (visualization.options) {
        ui_block.visualization_options_height = 1;
        ui_block.visualization_options = ReactDOM.render(React.createElement(visualization.options, {
            block: block,
            ui_block: ui_block,
            render_visualization: render_visualization
        }), document.querySelector('#block-' + block.name + ' .visualization_options'));
    } else {
        ui_block.visualization_options_height = 0;
        ui_block.visualization_options = null;
    }

    render_visualization(ui_block, visualization);

    resize(ui_block);
};
module.exports.render_output = render_output;
function render_visualization(ui_block, visualization) {
    try {
        ReactDOM.render(React.createElement(visualization, {
            block: ui_block.block,
            ui_block: ui_block,
            blocks: interpreter.blocks,
            options: ui_block.visualization_options ? ui_block.visualization_options.state : null,
            options_component: ui_block.visualization_options
        }), document.querySelector('#block-' + ui_block.block.name + ' .output'));
    } catch (e) {
        ui_block.block.error = 'Error in visualization: ' + e;
        render_error(ui_block.block);
    }
}

function delete_(ui_block) {
    $('#block-' + ui_block.block.name).remove();
    ui_blocks = _.reject(ui_blocks, ui_block_to_reject => ui_block_to_reject === ui_block);
}

function fade_background_color($element, alpha, color) {
    if (color[3] !== 'a') {
        throw 'Color needs to start with "rgba"';
    }
    alpha -= .04;
    if (alpha < 0) {
        $element.css('background-color', 'transparent');
        return;
    }
    var new_color = color.replace(' ', ` ${alpha})`);
    $element.css('background-color', new_color);
    setTimeout(fade_background_color, 1000 / 60, $element, alpha, color);
}
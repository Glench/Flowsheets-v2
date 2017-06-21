// @flow
const _ = require('underscore');
const React = require('react');
const $ = require('jquery');
const diff = require('diff');

const interpreter = require('./interpreter');
const cell_height = require('./renderer').cell_height;


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


class DefaultViz extends React.Component {
    state: Object;
    scroll: Function;
    should_flash: boolean;

    constructor(props:Object) {
        super(props);
        this.scroll = this.scroll.bind(this);

        this.state = {render_start: 0}
        this.should_flash = true;
    }

    componentDidMount() {
        this.flash_yellow();
    }

    componentDidUpdate(prevProps:Object, prevState: any) {
        if (this.should_flash) {
            this.flash_yellow();
        } else {
            this.should_flash = true;
        }
    }

    flash_yellow() {
        var $inputs = $(this.refs.container).find('input');
        fade_background_color($inputs, 1, 'rgba(255,255,0, ')
    }

    scroll(evt:Event) {
        if (!_.isObject(this.props.block.output) || !_.isArray(this.props.block.output) || this.props.block.error) {
            return
        }

        // scroll other blocks' output if they depend on this block
        interpreter.blocks.forEach(test_block => {
            if (test_block.depends_on.includes(this.props.block)) {
                $('#block-'+test_block.name).find('.output > *').scrollTop(this.refs.scrollable.scrollTop)
            }
        });

        this.should_flash = false;
        this.setState({render_start: Math.floor(this.refs.scrollable.scrollTop / cell_height)})
    }

    render() {
        var length = 1;

        
        var inputStyle = {
            height: cell_height - 2,
            display: 'block',
            width: '99%',
            border: 0,
            padding: '0 3px 2px 3px',
        }

        if (_.isArray(this.props.block.output) || _.isObject(this.props.block.output)) {
            length = _.size(this.props.block.output);
            var outputElement: any = []; // @flow hack;

            outputElement.push(React.createElement('div', {key: 'scroll-buffer-start', style: {height: this.state.render_start*cell_height}}))

            var i = 0;
            _.each(this.props.block.output, (item, index, output) => {
                if (i < this.state.render_start || i > this.state.render_start+this.props.ui_block.output_height) {
                    i += 1;
                    return
                }

                if (_.isArray(this.props.block.output)) {
                    outputElement.push(React.createElement('input', {style: inputStyle, value: !_.isUndefined(item.repr) ? item.repr : item, key: `${index}-${item}`}))
                } else {
                    outputElement.push(React.createElement('input', {style: inputStyle, value: ''+JSON.stringify(index)+': '+JSON.stringify(item)}))
                }
                i += 1;
            })

            outputElement.push(React.createElement('div', {
                key: 'scroll-buffer-end',
                style: {
                    height: (length - (this.state.render_start+this.props.ui_block.output_height))*cell_height
                }
            }))

            outputElement.push(
                React.createElement('div', {key: 'length', style: {
                    position: 'absolute',
                    right: 0,
                    bottom: 0,
                    fontSize: 9,
                    padding: '2px',
                    border: '1px solid #ddd',
                    backgroundColor: '#eee',
                    fontFamily: 'Clear Sans, Helvetica Neue, sans-serif',
                    fontWeight: 'bold',
                }}, 'Length: '+length)
            );
        } else {
            var outputElement: any = React.createElement('input', {style: inputStyle, value: JSON.stringify(this.props.block.output)});
        }
        return React.createElement('div', {ref: 'scrollable', onScroll: this.scroll}, 
            React.createElement('div', {ref: 'container', style: {height: cell_height*length}}, outputElement)
        )
    }
}
module.exports.DefaultViz = DefaultViz;


class RenderedHTMLViz extends React.Component {
    constructor(props:Object) {
        super(props)
    }

    render() {
        return React.createElement('div', {dangerouslySetInnerHTML: {__html: this.props.block.output}})
    }
}
module.exports.RenderedHTMLViz = RenderedHTMLViz;


class TextViz extends React.Component {
    constructor(props:Object) {
        super(props)
    }

    render() {
        return React.createElement('pre', {style: {margin: 0, lineHeight: 1.38}}, this.props.block.output)
    }
}
module.exports.TextViz = TextViz;

class TextDiffViz extends React.Component {
    constructor(props:Object) {
        super(props)
    }

    render() {
        var first_string_block = _.find(this.props.block.depends_on, test_block => _.isString(test_block.output))
        if (!first_string_block) {
            return React.createElement('div', null, this.props.block.output);
        }

        var changes = diff.diffChars(first_string_block.output, this.props.block.output);
        return React.createElement('div', null, changes.map((part,i) => {
            return React.createElement('span', {
                style: {
                    color: part.added ? 'green' : part.removed ? 'red' : 'grey',
                    fontWeight: part.added ? 'bold' : 'normal',
                    textDecoration: part.removed ? 'line-through' : 'none',
                },
                key: i,
            }, part.value)
        }))
    }
}
module.exports.TextDiffViz = TextDiffViz;

class RawJSONViz extends React.Component {
    constructor(props:Object) {
        super(props)
    }

    render() {
        return React.createElement('pre', {style: {margin: 0, lineHeight: 1.38}}, JSON.stringify(this.props.block.output, null, '    '))
    }
}
module.exports.RawJSONViz = RawJSONViz;


class CustomViz extends React.Component {
    constructor(props:Object) {
        super(props);
    }
    render() {
        return React.createElement('div', null, this.props.block.output);
    }
}
module.exports.CustomViz = CustomViz;

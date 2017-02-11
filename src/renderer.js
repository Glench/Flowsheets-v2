// @flow
// This file is required by index.html

const $ = require('jquery');

$('[name="code"').on('change', function(evt) {
    console.log('code change!')
})

$('[name="name"]').on('change', function(evt) {
    console.log('name change!')
})

// ui = {

// }

// module.exports = ui;
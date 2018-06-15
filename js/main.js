import {readColony, readGitter} from "./readers.js";
import * as utils from "./utils.js";

let fileData;
let annotation, annotationIndex;
let pairs;

function handleImage(f, ele) {
    const reader = new FileReader();

    // Closure to capture the file information.
    reader.onload = (theFile => {
        return e => {
            // Resize image to 2x container size for faster loading but still retain some detail
            utils.resizeImgData(e.target.result, $("#pairs").width(), dataUrl => {
                ele.innerHTML = `<img class="img-plate img-fluid" 
                                      src="${dataUrl}" 
                                      title="${encodeURI(theFile.name)}"/>`;
                ele.classList.add('show');
                initNewItem();
            });
        };
    })(f);

    // Read in the image file as a data URL.
    reader.readAsDataURL(f);
}

function handleDat(f, ele) {
    const reader = new FileReader();
    let sizes, normalized, div;
    let name = ele.parentElement.getAttribute('data-pair-name');
    let plateNum = ele.parentElement.getAttribute('data-plate-num');

    reader.onloadend = function (evt) {
        if (evt.target.readyState === FileReader.DONE) {
            let dat;

            if (evt.target.result.slice(0, 24) === 'Colony Project Data File') {
                dat = readColony(evt.target.result);
                sizes = dat.sizes;
            } else if (evt.target.result.slice(0, 8) === '# gitter') {
                sizes = readGitter(evt.target.result);
            } else {
                console.log('Unknown data file format');
                return;
            }
            let ad = utils.getArrayData(sizes.length);

            fileData[name]['dat'] = dat;
            fileData[name]['sizes'] = sizes;

            let pmm = utils.calculatePmm(sizes);
            fileData[name]['pmm'] = pmm;

            normalized = utils.normalizeWithPmmNoClip(sizes, pmm);

            /* Save pmm in attributes */
            ele.parentElement.setAttribute('data-pmm', pmm);

            div = document.createElement('div');
            ele.insertBefore(div, null);

            let data = [{
                x: ad.xAxis,
                y: ad.yAxis,
                z: normalized,
                text: ad.text,
                hoverinfo: 'text',
                type: 'heatmap',
                colorscale: [
                    [0, '#FF0000'],
                    [.5, '#000000'],
                    [1, '#00FF00']
                ],
                showscale: false,
                zauto: false,
                zmin: -.5,
                zmax: .5
            }];

            const axisTemplate = {
                showgrid: false,
                zeroline: false,
                linecolor: 'black',
                showticklabels: false,
                fixedrange: true,
                ticks: ''
            };

            const layout = {
                xaxis: axisTemplate,
                yaxis: axisTemplate,
                showlegend: false,
                width: $(ele).width(),
                height: ($(ele).width() / 3) * 2,
                margin: {
                    l: 0,
                    r: 0,
                    b: 0,
                    t: 0,
                    pad: 0
                }
            };

            Plotly.newPlot(div, data, layout, {displayModeBar: false});
            ele.classList.add('show');

            ele.parentElement.addEventListener('updateHeatmap', function (evt) {
                if (!!evt.detail['name'] && name !== evt.detail['name']) {
                    data[0]['z'] = math.subtract(
                        utils.normalizeWithPmmNoClip(sizes, pmm),
                        utils.normalizeWithPmmNoClip(fileData[evt.detail.name]['sizes'], fileData[evt.detail.name]['pmm']));
                } else {
                    data[0]['z'] = utils.normalizeWithPmmNoClip(sizes, pmm);
                }

                Plotly.update(div, data, layout);
            }, false);

            ele.parentElement.addEventListener('updateAnnotation', function () {
                let mtrx = math.ones(32, 48);

                for (let i = 0; i < annotation[plateNum].length; i++) {
                    let item = annotation[plateNum][i];
                    let row = item.row - 1;
                    let col = item.col - 1;

                    mtrx._data[row * 2 + 1][col * 2 + 1] = item.text;
                    mtrx._data[row * 2 + 1][col * 2] = item.text;
                    mtrx._data[row * 2][col * 2 + 1] = item.text;
                    mtrx._data[row * 2][col * 2] = item.text;
                }

                data[0].text = mtrx._data;
                data[0].hoverinfo = 'text';

                Plotly.update(div, data, layout);
            });

            div.on('plotly_hover', data => {
                for (let i = 0; i < data.points.length; i++) {
                    let point = data.points[i];

                    let update = {
                        shapes: [{
                            type: 'rect',
                            x0: point.x - point.x % 2 - 0.5,
                            y0: point.y - point.y % 2 - 0.5,
                            x1: point.x - point.x % 2 + 1.5,
                            y1: point.y - point.y % 2 + 1.5,
                            line: {
                                color: 'rgba(0, 0, 255, 1)',
                                width: 2
                            }
                        }]
                    };

                    Plotly.relayout(div, update);
                }
            });

            div.on('plotly_unhover', () => {
                Plotly.relayout(div, {shapes: []});
            });

            initNewItem();
        }
    };

    reader.readAsBinaryString(f);
}

/**
 * Called when all images and heatmaps are loaded
 */
function initListeners() {
    pairs = document.querySelectorAll('#pairs .row');
    let i, j, ele, eme;

    for (i = 0; ele = pairs[i]; i++) {
        /* Use this plate as the reference for other heatmaps */
        ele.addEventListener('click', function () {
            this.classList.toggle("bg-warning");
            let eventData = {'detail': {}};
            if (this.classList.contains('bg-warning')) {
                eventData['detail']['pmm'] = this.getAttribute('data-pmm');
                eventData['detail']['name'] = this.getAttribute('data-pair-name');
            }

            /* Dispatch update to all other heatmaps */
            for (j = 0; eme = pairs[j]; j++) {
                if (eme !== this) {
                    eme.classList.remove("bg-warning");
                }

                let event = new CustomEvent('updateHeatmap', eventData);
                eme.dispatchEvent(event);
            }
        }, false);
    }
}

/**
 * Recursively calls itself untill all new elements are loaded. Wrapped in a timeout for a smoother loading
 */
function initNewItem() {
    setTimeout(function () {
        let ele = document.querySelector('.new-plate');
        if (!ele) {
            initListeners();
            utils.setState('ready');
            return;
        }

        ele.classList.remove('new-plate');

        let name = ele.parentElement.getAttribute('data-pair-name');
        let data = fileData[name];

        document.getElementById(encodeURI(name)).classList.add('show');

        switch (ele.getAttribute('data-plate-type')) {
            case 'image':
                if (data.hasOwnProperty('image')) {
                    handleImage(data['image'], ele);
                } else {
                    initNewItem();
                }
                break;
            case 'heatmap':
                if (data.hasOwnProperty('data')) {
                    handleDat(data['data'], ele);
                } else {
                    initNewItem();
                }
                break;
        }
    }, 0);
}

function handleFileSelect(evt) {
    const files = evt.target.files; // FileList object
    let base, names = [], data, tally = {'images': 0, 'dats': 0}, colSize;
    let plateNum, match;
    let pairsParent, div, inner;

    utils.setState('loading');

    document.getElementById('gif').src = "";

    pairsParent = document.getElementById('pairs');
    pairsParent.innerHTML = ''; // Clear element
    fileData = {};

    for (let i = 0, f; f = files[i]; i++) {
        base = utils.getBaseName(f.name);

        if (!fileData.hasOwnProperty(base)) {
            fileData[base] = {};
            names.push(base);
        }

        if (f.type.match('image.*')) {
            tally['images']++;
            fileData[base]['image'] = f;
        } else {
            tally['dats']++;
            fileData[base]['data'] = f;
        }
    }

    names.sort();

    colSize = tally['images'] && tally['dats'] ? '6' : '12';

    for (let i = 0, name; name = names[i]; i++) {
        data = fileData[name];
        plateNum = '0';

        match = /_(plate|p)?(\d+)_/gi.exec(name);
        if (match != null) {
            plateNum = match[2];
        }

        div = document.createElement('div');
        div.classList.add('row');
        div.classList.add('py-2');
        div.setAttribute('data-pair-name', name);
        div.setAttribute('data-plate-num', plateNum);

        inner = `<div class="col-sm-12 fade" id="${encodeURI(name)}"><div><span class="h4">${name}</span></div></div>`;

        if (tally['images']) {
            inner += `<div class="col-sm-${colSize} fade new-plate" data-plate-type="image" id="${encodeURI(name)}-image"></div>`;
        }

        if (tally['dats']) {
            inner += `<div class="col-sm-${colSize} fade new-plate" data-plate-type="heatmap" id="${encodeURI(name)}-heatmap"></div>`;
        }

        div.innerHTML = inner;

        pairsParent.insertBefore(div, null);
    }

    initNewItem();
}

function dispatchAnnotationChange() {
    let i, ele;
    let event = new CustomEvent('updateAnnotation', annotation);

    for (i = 0; ele = pairs[i]; i++) {
        ele.dispatchEvent(event);
    }
}

function handleAnnotation() {
    let ele = $(this);
    let url = ele.attr("data-json");
    let genesList = $('#search-genes');

    genesList.val(null).trigger('change').prop("disabled", true);

    $.getJSON(url, function (data) {
        annotation = data;
        annotationIndex = {};
        dispatchAnnotationChange();

        let i, j;
        let strains = [];

        for (i in annotation) {
            if (!annotation.hasOwnProperty(i)) {
                continue;
            }

            for (j = 0; j < annotation[i].length; j++) {
                if (strains.indexOf(annotation[i][j].text) === -1) {
                    strains.push(annotation[i][j].text);
                    annotationIndex[annotation[i][j].text] = [];
                }

                annotationIndex[annotation[i][j].text].push({plate: i, item: j});
            }
        }

        for (i = 0; i < strains.length; i++) {
            let newOption = new Option(strains[i], strains[i], false, false);
            genesList.append(newOption);
        }

        genesList.trigger('change').prop("disabled", false);
    });
}

(function () {
    const modal = new Modal({el: document.getElementById('gif-modal')});
    modal.on('show', function (m) {
        m.el.classList.remove('fade');
    });

    modal.on('hide', function (m) {
        m.el.classList.add('fade');
    });

    document.getElementById('files').addEventListener('change', handleFileSelect, false);
    document.getElementById('btn-gif').addEventListener('click', () => {
        modal.show();
    }, false);

    let gifBtns = document.querySelectorAll('.gif-btn');
    for (let ib = 0, gifBtn; gifBtn = gifBtns[ib]; ib++) {
        gifBtn.addEventListener('click', function () {
            utils.createGif(this.getAttribute('data-gif')).then(() => {
                console.log("Gif created");
            });
        }, false);
    }

    let arrays = document.querySelectorAll('#annotate-array a');
    for (let i = 0, ele; ele = arrays[i]; i++) {
        ele.addEventListener('click', handleAnnotation, false);
    }

    $('#search-genes').select2({
        theme: "bootstrap",
        placeholder: "Search for a gene",
        disabled: true,
        width: 'style',
        dropdownAutoWidth: true
    });
})();

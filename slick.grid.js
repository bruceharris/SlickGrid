/**
 * BH Notes:
 *	data API: data.getItemMetadata is not documented
 *	onViewportChanged event can presumably be passed the direction (and it does not currently)
 *	there is also an onScroll event which gets passed the scrollTop and scrollLeft coordinates
 *	  need to look at the difference between onViewportChanged and onScroll - when do each get called?
 *	ph is page height in pixels
 *	need to understand rowsCache
 *	can we deal with arbitrary window resizing?
 */

/**
 * @license
 * (c) 2009-2010 Michael Leibman
 * michael{dot}leibman{at}gmail{dot}com
 * http://github.com/mleibman/slickgrid
 * Distributed under MIT license.
 * All rights reserved.
 *
 * SlickGrid v2.0 alpha
 *
 * NOTES:
 *     Cell/row DOM manipulations are done directly bypassing jQuery's DOM manipulation methods.
 *     This increases the speed dramatically, but can only be done safely because there are no event handlers
 *     or data associated with any cell/row DOM nodes.  Cell editors must make sure they implement .destroy()
 *     and do proper cleanup.
 */

// make sure required JavaScript modules are loaded
if (typeof jQuery === "undefined") {
    throw "SlickGrid requires jquery module to be loaded";
}
if (!jQuery.fn.drag) {
    throw "SlickGrid requires jquery.event.drag module to be loaded";
}
if (typeof Slick === "undefined") {
    throw "slick.core.js not loaded";
}

(function($) {
    // Slick.Grid
    $.extend(true, window, {
        Slick: {
            Grid: SlickGrid
        }
    });

    var scrollbarDimensions; // shared across all grids on this page

    //////////////////////////////////////////////////////////////////////////////////////////////
    // SlickGrid class implementation (available as Slick.Grid)

    /**
     * @param {Node}              container   Container node to create the grid in.
     * @param {Array,Object}      data        An array of objects for databinding.
     * @param {Array}             columns     An array of column definitions.
     * @param {Object}            options     Grid options.
     **/
    function SlickGrid(container,data,columns,options) {
        /// <summary>
        /// Create and manage virtual grid in the specified $container,
        /// connecting it to the specified data source. Data is presented
        /// as a grid with the specified columns and data.length rows.
        /// Options alter behaviour of the grid.
        /// </summary>

        // settings
        var defaults = {
            headerHeight: 25,
            rowHeight: 25,
            defaultColumnWidth: 80,
            enableAddRow: false,
            leaveSpaceForNewRows: false,
            editable: false,
            autoEdit: true,
            enableCellNavigation: true,
            enableColumnReorder: true,
            asyncEditorLoading: false,
            asyncEditorLoadDelay: 100,
            forceFitColumns: false,
            enableAsyncPostRender: false,
            asyncPostRenderDelay: 60,
            autoHeight: false,
            showHeaderRow: false,
            headerRowHeight: 25,
            showTopPanel: false,
            topPanelHeight: 25,
            formatterFactory: null
        };

        var columnDefaults = {
            name: "",
            resizable: true,
            sortable: false,
            minWidth: 30,
            rerenderOnResize: false,
            headerCssClass: null
        };

        // scroller
        var maxSupportedCssHeight;      // browser's breaking point
        var th;                         // virtual height
        var h;                          // real scrollable height
        var ph;                         // page height
        var n;                          // number of pages
        var cj;                         // "jumpiness" coefficient

        var page = 0;                   // current page
        var offset = 0;                 // current page offset
        var scrollDir = 1;

        // private
        var $container;
        var uid = "slickgrid_" + Math.round(1000000 * Math.random());
        var self = this;
        var $headerScroller;
        var $headers;
        var $headerRow, $headerRowScroller;
        var $topPanelScroller;
        var $topPanel;
        var $viewport;
        var $canvas;
        var $style;
        var stylesheet;
        var viewportH, viewportW;
        var viewportHasHScroll;
        var headerColumnWidthDiff, headerColumnHeightDiff, cellWidthDiff, cellHeightDiff;  // padding+border
        var absoluteColumnMinWidth;

        var activeRow, activeCell;

        var rowsCache = {};
        var renderedRows = 0;
        var numVisibleRows;
        var prevScrollTop = 0;
        var scrollTop = 0;
        var lastRenderedScrollTop = 0;
        var prevScrollLeft = 0;
        var avgRowRenderTime = 10;

        var cellCssClasses = {};

        var columnsById = {};

        // async call handles
        var h_render = null;
        var h_postrender = null;
        var postProcessedRows = {};
        var postProcessToRow = null;
        var postProcessFromRow = null;

        // perf counters
        var counter_rows_rendered = 0;
        var counter_rows_removed = 0;


        //////////////////////////////////////////////////////////////////////////////////////////////
        // Initialization

        function init() {
            /// <summary>
            /// Initialize 'this' (self) instance of a SlickGrid.
            /// This function is called by the constructor.
            /// </summary>

            $container = $(container);
            if($container.length < 1) {
              throw new Error("SlickGrid requires a valid container, "+container+" does not exist in the DOM.");
            }

            maxSupportedCssHeight = getMaxSupportedCssHeight();

            scrollbarDimensions = scrollbarDimensions || measureScrollbar(); // skip measurement if already have dimensions
            options = $.extend({},defaults,options);
            columnDefaults.width = options.defaultColumnWidth;

            // validate loaded JavaScript modules against requested options
            if (options.enableColumnReorder && !$.fn.sortable) {
                throw new Error("SlickGrid's \"enableColumnReorder = true\" option requires jquery-ui.sortable module to be loaded");
            }

            $container
                .empty()
                .attr("tabIndex",0)
                .attr("hideFocus",true)
                .css("overflow","hidden")
                .css("outline",0)
                .addClass(uid)
                .addClass("ui-widget");

            // set up a positioning container if needed
            if (!/relative|absolute|fixed/.test($container.css("position")))
                $container.css("position","relative");

            $headerScroller = $("<div class='slick-header ui-state-default' style='overflow:hidden;position:relative;' />").appendTo($container);
            $headers = $("<div class='slick-header-columns'/>").appendTo($headerScroller);
            //$headers = $("<div class='slick-header-columns' style='width:10000px; left:-1000px' />").appendTo($headerScroller);

            $headerRowScroller = $("<div class='slick-headerrow ui-state-default' style='overflow:hidden;position:relative;' />").appendTo($container);
            $headerRow = $("<div class='slick-headerrow-columns' style='width:10000px;' />").appendTo($headerRowScroller);

            $topPanelScroller = $("<div class='slick-top-panel-scroller ui-state-default' style='overflow:hidden;position:relative;' />").appendTo($container);
            $topPanel = $("<div class='slick-top-panel' style='width:10000px' />").appendTo($topPanelScroller);

            if (!options.showTopPanel) {
                $topPanelScroller.hide();
            }

            if (!options.showHeaderRow) {
                $headerRowScroller.hide();
            }

            $viewport = $("<div class='slick-viewport' tabIndex='0' hideFocus style='width:100%;overflow-x:auto;outline:0;position:relative;overflow-y:auto;'>").appendTo($container);
            $canvas = $("<div class='grid-canvas' tabIndex='0' hideFocus />").appendTo($viewport);

            // header columns and cells may have different padding/border skewing width calculations (box-sizing, hello?)
            // calculate the diff so we can set consistent sizes
            measureCellPaddingAndBorder();

            // for usability reasons, all text selection in SlickGrid is disabled
            // with the exception of input and textarea elements (selection must
            // be enabled there so that editors work as expected); note that
            // selection in grid cells (grid body) is already unavailable in
            // all browsers except IE
            disableSelection($headers); // disable all text selection in header (including input and textarea)

            if (!options.enableTextSelectionOnCells) {
                // disable text selection in grid cells except in input and textarea elements
                // (this is IE-specific, because selectstart event will only fire in IE)
                $viewport.bind("selectstart.ui", function (event) {
                    return $(event.target).is("input,textarea");
                });
            }

            viewportW = parseFloat($.css($container[0], "width", true));

            createColumnHeaders();
            createCssRules();
            resizeAndRender();

            $viewport.bind("scroll.slickgrid", handleScroll);
            $container.bind("resize.slickgrid", resizeAndRender);
        }

        function getCanvasNode() {
            return $canvas[0];
        }

        function measureScrollbar() {
            /// <summary>
            /// Measure width of a vertical scrollbar
            /// and height of a horizontal scrollbar.
            /// </summary
            /// <returns>
            /// { width: pixelWidth, height: pixelHeight }
            /// </returns>
            var $c = $("<div style='position:absolute; top:-10000px; left:-10000px; width:100px; height:100px; overflow:scroll;'></div>").appendTo("body");
            var dim = { width: $c.width() - $c[0].clientWidth, height: $c.height() - $c[0].clientHeight };
            $c.remove();
            return dim;
        }

        function getRowWidth() {
            var rowWidth = 0;
            var i = columns.length;
            while (i--) {
                rowWidth += (columns[i].width || columnDefaults.width);
            }
            return rowWidth;
        }

        function setCanvasWidth(width) {
            $canvas.width(width);
            viewportHasHScroll = (width > viewportW - scrollbarDimensions.width);
        }

        function disableSelection($target) {
            /// <summary>
            /// Disable text selection (using mouse) in
            /// the specified target.
            /// </summary
            if ($target && $target.jquery) {
                $target
                    .attr('unselectable', 'on')
                    .css('MozUserSelect', 'none')
                    .bind('selectstart.ui', function() { return false; }); // from jquery:ui.core.js 1.7.2
            }
        }

        function getMaxSupportedCssHeight() {
            var increment = 1000000;
            var supportedHeight = increment;
            // FF reports the height back but still renders blank after ~6M px
            var testUpTo = ($.browser.mozilla) ? 5000000 : 1000000000;
            var div = $("<div style='display:none' />").appendTo(document.body);

            while (supportedHeight <= testUpTo) {
                div.css("height", supportedHeight + increment);
                if (div.height() !== supportedHeight + increment)
                    break;
                else
                    supportedHeight += increment;
            }

            div.remove();
            return supportedHeight;
        }

        function unbindAncestorScrollEvents() {
            $canvas.parents().unbind("scroll.slickgrid");
        }

        function getHeaderRow() {
            return $headerRow[0];
        }

        function createColumnHeaders() {
            var i;

            function hoverBegin() {
                $(this).addClass("ui-state-hover");
            }
            function hoverEnd() {
                $(this).removeClass("ui-state-hover");
            }

            $headers.empty();
            $headerRow.empty();
            columnsById = {};

            for (i = 0; i < columns.length; i++) {
                var m = columns[i] = $.extend({},columnDefaults,columns[i]);
                columnsById[m.id] = i;

                var header = $("<div class='ui-state-default slick-header-column' id='" + uid + m.id + "' />")
                    .html("<span class='slick-column-name'>" + m.name + "</span>")
                    .width(m.width - headerColumnWidthDiff)
                    .attr("title", m.toolTip || m.name || "")
                    .data("fieldId", m.id)
                    .addClass(m.headerCssClass || "")
                    .appendTo($headers);

                if (options.enableColumnReorder || m.sortable) {
                    header.hover(hoverBegin, hoverEnd);
                }

                if (m.sortable) {
                    header.append("<span class='slick-sort-indicator' />");
                }

                if (options.showHeaderRow) {
                    $("<div class='ui-state-default slick-headerrow-column c" + i + "'></div>").appendTo($headerRow);
                }
            }
        }

        function getVBoxDelta($el) {
            var p = ["borderTopWidth", "borderBottomWidth", "paddingTop", "paddingBottom"];
            var delta = 0;
            $.each(p, function(n,val) { delta += parseFloat($el.css(val)) || 0; });
            return delta;
        }

        function measureCellPaddingAndBorder() {
            var el;
            var h = ["borderLeftWidth", "borderRightWidth", "paddingLeft", "paddingRight"];
            var v = ["borderTopWidth", "borderBottomWidth", "paddingTop", "paddingBottom"];

            el = $("<div class='ui-state-default slick-header-column' style='visibility:hidden'>-</div>").appendTo($headers);
            headerColumnWidthDiff = headerColumnHeightDiff = 0;
            $.each(h, function(n,val) { headerColumnWidthDiff += parseFloat(el.css(val)) || 0; });
            $.each(v, function(n,val) { headerColumnHeightDiff += parseFloat(el.css(val)) || 0; });
            el.remove();

            var r = $("<div class='slick-row' />").appendTo($canvas);
            el = $("<div class='slick-cell' id='' style='visibility:hidden'>-</div>").appendTo(r);
            cellWidthDiff = cellHeightDiff = 0;
            $.each(h, function(n,val) { cellWidthDiff += parseFloat(el.css(val)) || 0; });
            $.each(v, function(n,val) { cellHeightDiff += parseFloat(el.css(val)) || 0; });
            r.remove();

            absoluteColumnMinWidth = Math.max(headerColumnWidthDiff,cellWidthDiff);
        }

        function createCssRules() {
            $style = $("<style type='text/css' rel='stylesheet' />").appendTo($("head"));
            var rowHeight = (options.rowHeight - cellHeightDiff);

            var rules = [
                //"." + uid + " .slick-header-column { left: 1000px; }",
                "." + uid + " .slick-top-panel { height:" + options.topPanelHeight + "px; }",
                "." + uid + " .slick-headerrow-columns { height:" + options.headerRowHeight + "px; }",
                "." + uid + " .slick-cell { height:" + rowHeight + "px; }",
                "." + uid + " .slick-row { width:" + getRowWidth() + "px; height:" + options.rowHeight + "px; }",
                "." + uid + " .lr { float:none; position:absolute; }"
            ];

            var rowWidth = getRowWidth();
            var x = 0, w;
            for (var i=0; i<columns.length; i++) {
                w = columns[i].width;
                rules.push("." + uid + " .l" + i + " { left: " + x + "px; }");
                rules.push("." + uid + " .r" + i + " { right: " + (rowWidth - x - w) + "px; }");
                x += columns[i].width;
            }

            if ($style[0].styleSheet) { // IE
                $style[0].styleSheet.cssText = rules.join(" ");
            }
            else {
                $style[0].appendChild(document.createTextNode(rules.join(" ")));
            }

            var sheets = document.styleSheets;
            for (var i=0; i<sheets.length; i++) {
                if ((sheets[i].ownerNode || sheets[i].owningElement) == $style[0]) {
                    stylesheet = sheets[i];
                    break;
                }
            }
        }

        function findCssRule(selector) {
            var rules = (stylesheet.cssRules || stylesheet.rules);

            for (var i=0; i<rules.length; i++) {
                if (rules[i].selectorText == selector)
                    return rules[i];
            }

            return null;
        }

        function removeCssRules() {
            $style.remove();
        }

        function destroy() {
            trigger(self.onBeforeDestroy, {});

            if (options.enableColumnReorder && $headers.sortable)
                $headers.sortable("destroy");

            unbindAncestorScrollEvents();
            $container.unbind(".slickgrid");
            removeCssRules();

            $container.empty().removeClass(uid);
        }


        //////////////////////////////////////////////////////////////////////////////////////////////
        // General

        function trigger(evt, args, e) {
            e = e || new Slick.EventData();
            args = args || {};
            args.grid = self;
            return evt.notify(args, e, self);
        }

        function getColumnIndex(id) {
            return columnsById[id];
        }

        function getColumns() {
            return columns;
        }

        function getOptions() {
            return options;
        }

        function setOptions(args) {
            if (options.enableAddRow !== args.enableAddRow) {
                invalidateRow(getDataLength());
            }

            options = $.extend(options,args);

            render();
        }

        function setData(newData,scrollToTop) {
            invalidateAllRows();
            data = newData;
            if (scrollToTop)
                scrollTo(0);
        }

        function getData() {
            return data;
        }

        function getDataLength() {
            if (data.getLength) {
                return data.getLength();
            }
            else {
                return data.length;
            }
        }

        function getDataItem(i) {
            if (data.getItem) {
                return data.getItem(i);
            }
            else {
                return data[i];
            }
        }

        function getTopPanel() {
            return $topPanel[0];
        }

        function showTopPanel() {
            options.showTopPanel = true;
            $topPanelScroller.slideDown("fast", resizeCanvas);
        }

        //////////////////////////////////////////////////////////////////////////////////////////////
        // Rendering / Scrolling

        function scrollTo(y) {
            var oldOffset = offset;

            page = Math.min(n-1, Math.floor(y / ph));
            offset = Math.round(page * cj);
            var newScrollTop = y - offset;

            if (offset != oldOffset) {
                var range = getVisibleRange(newScrollTop);
                cleanupRows(range.top,range.bottom);
                updateRowPositions();
            }

            if (prevScrollTop != newScrollTop) {
                scrollDir = (prevScrollTop + oldOffset < newScrollTop + offset) ? 1 : -1;
                $viewport[0].scrollTop = (lastRenderedScrollTop = scrollTop = prevScrollTop = newScrollTop);

                trigger(self.onViewportChanged, {});
            }
        }

        function defaultFormatter(row, cell, value, columnDef, dataContext) {
            return (value === null || value === undefined) ? "" : value;
        }

        function getFormatter(row, column) {
            var rowMetadata = data.getItemMetadata && data.getItemMetadata(row);

            // look up by id, then index
            var columnOverrides = rowMetadata &&
                    rowMetadata.columns &&
                    (rowMetadata.columns[column.id] || rowMetadata.columns[getColumnIndex(column.id)]);

            return (columnOverrides && columnOverrides.formatter) ||
                    (rowMetadata && rowMetadata.formatter) ||
                    column.formatter ||
                    (options.formatterFactory && options.formatterFactory.getFormatter(column)) ||
                    defaultFormatter;
        }

        function appendRowHtml(stringArray, row) {
            var d = getDataItem(row);
            var dataLoading = row < getDataLength() && !d;
            var cellCss;
            var rowCss = "slick-row " +
                (dataLoading ? " loading" : "") +
                (row % 2 == 1 ? ' odd' : ' even');

            var metadata = data.getItemMetadata && data.getItemMetadata(row);

            if (metadata && metadata.cssClasses) {
                rowCss += " " + metadata.cssClasses;
            }

            stringArray.push("<div class='ui-widget-content " + rowCss + "' row='" + row + "' style='top:" + (options.rowHeight*row-offset) + "px'>");

            var colspan;
            var rowHasColumnData = metadata && metadata.columns;

            for (var i=0, cols=columns.length; i<cols; i++) {
                var m = columns[i];
                colspan = getColspan(row, i);  // TODO:  don't calc unless we have to
                cellCss = "slick-cell lr l" + i + " r" + Math.min(columns.length -1, i + colspan - 1) + (m.cssClass ? " " + m.cssClass : "");
                if (row === activeRow && i === activeCell) {
                    cellCss += (" active");
                }

                // TODO:  merge them together in the setter
                for (var key in cellCssClasses) {
                    if (cellCssClasses[key][row] && cellCssClasses[key][row][m.id]) {
                        cellCss += (" " + cellCssClasses[key][row][m.id]);
                    }
                }

                stringArray.push("<div class='" + cellCss + "'>");

                // if there is a corresponding row (if not, this is the Add New row or this data hasn't been loaded yet)
                if (d) {
                    stringArray.push(getFormatter(row, m)(row, i, d[m.field], m, d));
                }

                stringArray.push("</div>");

                if (colspan)
                    i += (colspan - 1);
            }

            stringArray.push("</div>");
        }

        function cleanupRows(rangeToKeep) {
            for (var i in rowsCache) {
                if (((i = parseInt(i, 10)) !== activeRow) && (i < rangeToKeep.top || i > rangeToKeep.bottom)) {
                    removeRowFromCache(i);
                }
            }
        }

        function invalidate() {
           updateRowCount();
           invalidateAllRows();
           render();
        }

        function invalidateAllRows() {
            for (var row in rowsCache) {
                removeRowFromCache(row);
            }
        }

        function removeRowFromCache(row) {
            var node = rowsCache[row];
            if (!node) { return; }
            $canvas[0].removeChild(node);

            delete rowsCache[row];
            delete postProcessedRows[row];
            renderedRows--;
            counter_rows_removed++;
        }

        function invalidateRows(rows) {
            var i, rl;
            if (!rows || !rows.length) { return; }
            scrollDir = 0;
            for (i=0, rl=rows.length; i<rl; i++) {
                if (rowsCache[rows[i]]) {
                    removeRowFromCache(rows[i]);
                }
            }
        }

        function invalidateRow(row) {
            invalidateRows([row]);
        }

        function getViewportHeight() {
            return parseFloat($.css($container[0], "height", true)) -
                options.headerHeight -
                getVBoxDelta($headers) -
                (options.showTopPanel ? options.topPanelHeight + getVBoxDelta($topPanelScroller) : 0) -
                (options.showHeaderRow ? options.headerRowHeight + getVBoxDelta($headerRowScroller) : 0);
        }

        function resizeCanvas() {
            if (options.autoHeight) {
                viewportH = options.rowHeight * (getDataLength() + (options.enableAddRow ? 1 : 0) + (options.leaveSpaceForNewRows? numVisibleRows - 1 : 0));
            }
            else {
                viewportH = getViewportHeight();
            }

            numVisibleRows = Math.ceil(viewportH / options.rowHeight);
            viewportW = parseFloat($.css($container[0], "width", true));
            $viewport.height(viewportH);

            var w = 0, i = columns.length;
            while (i--) {
                w += columns[i].width;
            }
            setCanvasWidth(w);

            updateRowCount();
            render();
        }

        function resizeAndRender() {
            resizeCanvas();
        }

        function updateRowCount() {
            var newRowCount = getDataLength() + (options.enableAddRow?1:0) + (options.leaveSpaceForNewRows?numVisibleRows-1:0);
            var oldH = h;

            // remove the rows that are now outside of the data range
            // this helps avoid redundant calls to .removeRow() when the size of the data decreased by thousands of rows
            var l = options.enableAddRow ? getDataLength() : getDataLength() - 1;
            for (var i in rowsCache) {
                if (i >= l) {
                    removeRowFromCache(i);
                }
            }
            th = Math.max(options.rowHeight * newRowCount, viewportH - scrollbarDimensions.height);
            if (th < maxSupportedCssHeight) {
                // just one page
                h = ph = th;
                n = 1;
                cj = 0;
            }
            else {
                // break into pages
                h = maxSupportedCssHeight;
                ph = h / 100;
                n = Math.floor(th / ph);
                cj = (th - h) / (n - 1);
            }

            if (h !== oldH) {
                $canvas.css("height",h);
                scrollTop = $viewport[0].scrollTop;
            }

            var oldScrollTopInRange = (scrollTop + offset <= th - viewportH);

            if (th == 0 || scrollTop == 0) {
                page = offset = 0;
            }
            else if (oldScrollTopInRange) {
                // maintain virtual position
                scrollTo(scrollTop+offset);
            }
            else {
                // scroll to bottom
                scrollTo(th-viewportH);
            }

            if (h != oldH && options.autoHeight) {
                resizeCanvas();
            }
        }

        function getVisibleRange(viewportTop) {
            var maxLength = getDataLength() - (options.enableAddrow ? 0 : 1);
            if (viewportTop == null)
                viewportTop = scrollTop;
            return {
                top: Math.floor((scrollTop+offset)/options.rowHeight),
                bottom: Math.min(maxLength, Math.floor((scrollTop+offset+viewportH)/options.rowHeight))
            };
        }

        function getRenderedRange(viewportTop) {
            var range = getVisibleRange(viewportTop);
            var buffer = Math.round(viewportH/options.rowHeight);
            var minBuffer = 3;

            if (scrollDir == -1) {
                range.top -= buffer;
                range.bottom += minBuffer;
            }
            else if (scrollDir == 1) {
                range.top -= minBuffer;
                range.bottom += buffer;
            }
            else {
                range.top -= minBuffer;
                range.bottom += minBuffer;
            }

            range.top = Math.max(0,range.top);
            range.bottom = Math.min(options.enableAddRow ? getDataLength() : getDataLength() - 1,range.bottom);

            return range;
        }

        function renderRows(range) {
            var i, l,
                parentNode = $canvas[0],
                rowsBefore = renderedRows,
                stringArray = [],
                rows = [],
                startTimestamp = new Date();

            for (i = range.top; i <= range.bottom; i++) {
                if (rowsCache[i]) { continue; }
                renderedRows++;
                rows.push(i);
                appendRowHtml(stringArray,i);
                counter_rows_rendered++;
            }

            var x = document.createElement("div");
            x.innerHTML = stringArray.join("");

            for (i = 0, l = x.childNodes.length; i < l; i++) {
                rowsCache[rows[i]] = parentNode.appendChild(x.firstChild);
            }

            if (renderedRows - rowsBefore > 5) {
                avgRowRenderTime = (new Date() - startTimestamp) / (renderedRows - rowsBefore);
            }
        }

        function startPostProcessing() {
            if (!options.enableAsyncPostRender) { return; }
            clearTimeout(h_postrender);
            h_postrender = setTimeout(asyncPostProcessRows, options.asyncPostRenderDelay);
        }

        function invalidatePostProcessingResults(row) {
            delete postProcessedRows[row];
            postProcessFromRow = Math.min(postProcessFromRow,row);
            postProcessToRow = Math.max(postProcessToRow,row);
            startPostProcessing();
        }

        function updateRowPositions() {
            for (var row in rowsCache) {
                rowsCache[row].style.top = (row*options.rowHeight-offset) + "px";
            }
        }

        function render() {
            var visible = getVisibleRange();
            var rendered = getRenderedRange();

            // remove rows no longer in the viewport
            cleanupRows(rendered);

            // add new rows
            renderRows(rendered);

            postProcessFromRow = visible.top;
            postProcessToRow = Math.min(options.enableAddRow ? getDataLength() : getDataLength() - 1, visible.bottom);
            startPostProcessing();

            lastRenderedScrollTop = scrollTop;
            h_render = null;
        }

        function handleScroll() {
            scrollTop = $viewport[0].scrollTop;
            var scrollLeft = $viewport[0].scrollLeft;
            var scrollDist = Math.abs(scrollTop - prevScrollTop);

            if (scrollLeft !== prevScrollLeft) {
                prevScrollLeft = scrollLeft;
                $headerScroller[0].scrollLeft = scrollLeft;
                $topPanelScroller[0].scrollLeft = scrollLeft;
                $headerRowScroller[0].scrollLeft = scrollLeft;
            }

            if (scrollDist) {
                scrollDir = prevScrollTop < scrollTop ? 1 : -1;
                prevScrollTop = scrollTop;

                // switch virtual pages if needed
                if (scrollDist < viewportH) {
                    scrollTo(scrollTop + offset);
                }
                else {
                    var oldOffset = offset;
                    page = Math.min(n - 1, Math.floor(scrollTop * ((th - viewportH) / (h - viewportH)) * (1 / ph)));
                    offset = Math.round(page * cj);
                    if (oldOffset != offset)
                        invalidateAllRows();
                }

                if (h_render)
                    clearTimeout(h_render);

                if (Math.abs(lastRenderedScrollTop - scrollTop) < viewportH)
                    render();
                else
                    h_render = setTimeout(render, 50);

                trigger(self.onViewportChanged, {});
            }

            trigger(self.onScroll, {scrollLeft:scrollLeft, scrollTop:scrollTop});
        }

        function asyncPostProcessRows() {
            while (postProcessFromRow <= postProcessToRow) {
                var row = (scrollDir >= 0) ? postProcessFromRow++ : postProcessToRow--;
                var rowNode = rowsCache[row];
                if (!rowNode || postProcessedRows[row] || row>=getDataLength()) { continue; }

                var d = getDataItem(row), cellNodes = rowNode.childNodes;
                for (var i=0, j=0, l=columns.length; i<l; ++i) {
                    var m = columns[i];
                    if (m.asyncPostRender) { m.asyncPostRender(cellNodes[j], postProcessFromRow, d, m); }
                    ++j;
                }

                postProcessedRows[row] = true;
                h_postrender = setTimeout(asyncPostProcessRows, options.asyncPostRenderDelay);
                return;
            }
        }

        //////////////////////////////////////////////////////////////////////////////////////////////
        // Interactivity

        function cellExists(row,cell) {
            return !(row < 0 || row >= getDataLength() || cell < 0 || cell >= columns.length);
        }

        function getCellNodeBox(row,cell) {
             if (!cellExists(row,cell))
                 return null;

             var y1 = row * options.rowHeight - offset;
             var y2 = y1 + options.rowHeight - 1;
             var x1 = 0;
             for (var i=0; i<cell; i++) {
                 x1 += columns[i].width;
             }
             var x2 = x1 + columns[cell].width;

             return {
                 top: y1,
                 left: x1,
                 bottom: y2,
                 right: x2
             };
         }

        //////////////////////////////////////////////////////////////////////////////////////////////
        // Cell switching

        function scrollRowIntoView(row, doPaging) {
            var rowAtTop = row * options.rowHeight;
            var rowAtBottom = (row + 1) * options.rowHeight - viewportH + (viewportHasHScroll?scrollbarDimensions.height:0);

            // need to page down?
            if ((row + 1) * options.rowHeight > scrollTop + viewportH + offset) {
                scrollTo(doPaging ? rowAtTop : rowAtBottom);
                render();
            }

            // or page up?
            else if (row * options.rowHeight < scrollTop + offset) {
                scrollTo(doPaging ? rowAtBottom : rowAtTop);
                render();
            }
        }

        function getColspan(row, cell) {
            var metadata = data.getItemMetadata && data.getItemMetadata(row);
            if (!metadata || !metadata.columns) {
                return 1;
            }

            var columnData = metadata.columns[columns[cell].id] || metadata.columns[cell];
            var colspan = (columnData && columnData.colspan);
            if (colspan === "*") {
                colspan = columns.length - cell;
            }
            return (colspan || 1);
        }

        //////////////////////////////////////////////////////////////////////////////////////////////
        // Debug

        this.debug = function() {
            var s = "";

            s += ("\n" + "counter_rows_rendered:  " + counter_rows_rendered);
            s += ("\n" + "counter_rows_removed:  " + counter_rows_removed);
            s += ("\n" + "renderedRows:  " + renderedRows);
            s += ("\n" + "numVisibleRows:  " + numVisibleRows);
            s += ("\n" + "maxSupportedCssHeight:  " + maxSupportedCssHeight);
            s += ("\n" + "n(umber of pages):  " + n);
            s += ("\n" + "(current) page:  " + page);
            s += ("\n" + "page height (ph):  " + ph);
            s += ("\n" + "scrollDir:  " + scrollDir);

            alert(s);
        };

        // a debug helper to be able to access private members
        this.eval = function(expr) {
            return eval(expr);
        };

        //////////////////////////////////////////////////////////////////////////////////////////////
        // Public API

        $.extend(this, {
            "slickGridVersion": "2.0a1",

            // Events
            "onScroll":                     new Slick.Event(),
            "onViewportChanged":            new Slick.Event(),
            "onBeforeDestroy":              new Slick.Event(),

            // Methods
            "getColumns":                   getColumns,
            "getColumnIndex":               getColumnIndex,
            "getOptions":                   getOptions,
            "setOptions":                   setOptions,
            "getData":                      getData,
            "getDataLength":                getDataLength,
            "getDataItem":                  getDataItem,
            "setData":                      setData,

            "render":                       render,
            "invalidate":                   invalidate,
            "invalidateRow":                invalidateRow,
            "invalidateRows":               invalidateRows,
            "invalidateAllRows":            invalidateAllRows,
            "getViewport":                  getVisibleRange,
            "getRenderedRange":             getRenderedRange,
            "resizeCanvas":                 resizeCanvas,
            "updateRowCount":               updateRowCount,
            "scrollRowIntoView":            scrollRowIntoView,
            "getCanvasNode":                getCanvasNode,

            "getCellNodeBox":               getCellNodeBox,
            "getTopPanel":                  getTopPanel,
            "showTopPanel":                 showTopPanel,
            "getHeaderRow":                 getHeaderRow,

            "destroy":                      destroy,
			getScroller: function(){
				return {
					maxSupportedCssHeight: maxSupportedCssHeight,
					th: th,
					h: h,
   					ph: ph,
					n: n,
   					cj: cj,
					page: page,
   					offset: offset,
					scrollDir: scrollDir
				};
			}
        });

        init();
    }
}(jQuery));

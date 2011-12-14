(function ($) {
    /**
     * @param {Function}       fetchData     Fetches data from remote source and loads it into local cache. This is a method
     *                                       that will be added to the protoype of the Range constructor defined below. An 
     *                                       instance of Range represents a range of rows, has properties .top and .bottom
     *                                       which are to be used in the fetchData method to tell the data source what rows
     *                                       to return. After data is retrieved (presumably in the success handler of the AJAX
     *                                       call) the range's loadData method must be called. See loadData below.
     * @param {Array,String}   [fields]      Optional array of field names, only necessary if mapping data cells to fields by column index
     * @param {Number}         [numRows]     Optional total rows in data source - alternatively can be set by setLength method
     *                                       if not known at time of instantiation
     * @param {Number}         [blockSize]   Optional # of rows to retrieve in each fetch (default is 100)
     */
    function LazyLoader(args){
        // events
        var onDataLoaded = new Slick.Event();

        // data is fetched one block at a time; data is segmented into blocks of a fixed row size.
        // what is the range of the block that a given row is in?
        function getBlockRange(row){
            var blockSize = args.blockSize || 100,
                top = Math.floor(row / blockSize) * blockSize;
            return new Range({
                top: top,
                bottom: Math.min(top + blockSize - 1, dataCache.length - 1)
            });
        }
        
        // data status codes:
        var VIRGIN = 0, REQUESTED = 1, READY = 2;

        var dataCache = {
            // properties
            length: args.numRows,
            '0': undefined, // defined here for informational purposes only, actual data rows will be added by row index

            // methods
            getRowStatus: function (row) {
                return (row === undefined ? VIRGIN : (row === null ? REQUESTED : READY) );
            },
            setRowStatus: function (row, stat) {
                if (stat === VIRGIN) delete this[row];
                else if (stat === REQUESTED) this[row] = null;
            }
        };
        
        // constructor
        // bounds is an object with properties top, bottom
        function Range(bounds){
            this.top = Math.max(0, bounds.top);
            this.bottom = Math.min(dataCache.length - 1, bounds.bottom);
        }

        $.extend(Range.prototype, {
            fetchData: args.fetchData,
            isDataReady: function () {
                for (var r=this.top; r<=this.bottom; r++) if (dataCache.getRowStatus(r) !== READY) return false;
                return true;
            },
            ensureDataLoaded: function () {
                // check if row is needed, if so, go get its block. we won't repeat as we marks cells as 'requested'
                for (var r=this.top; r<=this.bottom; r++) if (dataCache.getRowStatus(r) === VIRGIN) getBlockRange(r).markRequested().fetchData();
            },
            markRequested: function () {
                for (var r=this.top; r<=this.bottom; r++) dataCache.setRowStatus(r, REQUESTED);
                return this;
            },
            markVirgin: function () {
                for (var r=this.top; r<=this.bottom; r++) dataCache.setRowStatus(r, VIRGIN);
                return this;
            },
            // Range.fetchData method's handler needs to call Range.loadData
            // cells is an object, its content is described by the optional (string) format argument, default is 'fields'
            //   'fields': array of objects, where each object represents a row and contains columns keyed by field name
            //   'indices': array of objects (or arrays), where each object represents a row and contains columns keyed by column index
            //                (column indices here map to the actual full set of columns)
            loadData: function (cells, format) {
                var me = this,
                    numRows = me.bottom - me.top + 1,
                    format = format || 'fields';
                function columnKey(colNum){
                    return args.fields[colNum].field;
                } 
                for (var r=0; r<numRows; r++) {
                    var row = {};
                    if (format === 'indices') {
                        if (!args.fields) throw Error("Range.loadData() can only be called with 'indices' if fields option is provided to LazyLoader()");
                        for (var c=0; c<args.fields.length; c++) row[columnKey(c)] = cells[r][c];
                    } else {
                        row = cells[r];
                    }
                    dataCache[me.top + r] = row;
                }
                // TODO: catch and handle failure
                onDataLoaded.notify(me);
            }
        });
        
        return {
            // properties
            _dataCache: dataCache, // exposed for debugging

            // bounds is an object with properties top and bottom
            range: function (bounds) {
                return new Range(bounds);
            },
            getItem: function (i) {
                return dataCache[i];
            },
            getLength: function () {
                return dataCache.length;
            },
            setLength: function (l) {
                dataCache.length = l;
            },

            // events
            onDataLoaded: onDataLoaded
        };
    }

    // Slick.Data.LazyLoader
    $.extend(true, window, { Slick: { Data: { LazyLoader: LazyLoader }}});
})(jQuery); 

(function ($) {
    /**
     * Loads data lazily (as needed) from a remote data source
     * @param {Object}       args
     * @param {Function}     args.fetchData     Fetches data from remote source and loads it into local cache. This is a method
     *                                          that will be added to the protoype of the Range constructor defined below. An 
     *                                          instance of Range represents a range of rows, has properties .top and .bottom
     *                                          which are to be used in the fetchData method to tell the data source what rows
     *                                          to return. After data is retrieved (presumably in the success handler of the AJAX
     *                                          call) the range's loadData method must be called. See loadData below.
BH     * @param {Number}       [args.timeout]     Optional # of seconds to wait before giving up on an XHR to return
BH     * @param {Number}       [args.retries]     Optional # of times to retry a failed XHR
BH     * @param {Number}       [args.poolSize]   Optional max # of outstanding XHRs (fetchData requests)
     * @param {Array,String} [args.fields]      Optional array of field names, only necessary if mapping data cells to fields by column index
     * @param {Number}       [args.numRows]     Optional total rows in data source - alternatively can be set by setLength method
     *                                          if not known at time of instantiation
     * @param {Number}       [args.blockSize]   Optional # of rows to retrieve in each fetch (default is 100)
     */
    function LazyLoader(args){
        // events
        var onDataLoaded = new Slick.Event();

        // data status codes:
        var VIRGIN = 0, REQUESTED = 1, READY = 2, UNAVAILABLE = 3;

        var timeout = 1000 * (args.timeout || 20), // milliseconds, default 20 seconds
            retries = args.retries || 0;

        // data is fetched one block at a time; data is segmented into blocks of a fixed row size.
        var dataCache = {
            // properties
            length: args.numRows || 1, // default to 1 so things don't break before we get a chance to call setLength
            blockSize: args.blockSize || 100,
            blocks: [], // each block of data (rows) is an array; blocks will be an array of arrays

            // methods
            getBlockStatus: function (blockIndex) {
                var b = this.blocks[blockIndex];
                return (b === undefined ? VIRGIN : ($.isArray(b) ? READY : b) );
            },
            // stat must be either VIRGIN, REQUESTED, or UNAVAILABLE
            setBlockStatus: function (blockIndex, stat) {
                delete this.blocks[blockIndex];
                if (stat !== VIRGIN) this.blocks[blockIndex] = stat;
            }
        };

        // which block is this row in?
        function getBlockIndex(row){
            return Math.floor(row / dataCache.blockSize);
        }

        // what rows are in this block?
        // i is the index of the block
        function getBlockRange(i){
            var s = dataCache.blockSize;
            return new Range({ top: i * s, bottom: i * s + s - 1 });
        }

        // pool of outstanding blocks to fetch
        var pool = {
            _p: [], // array of block indices to be fetched
            _max: args.poolSize || 4,
            _doNext: function () {
                if (!this._p.length) return;
                var i = this._p[0];
                getBlockRange(i).fetchData();
                
                // BH up to here
                function checkDone(attempt){

                }
                var t = setTimeout(..., timeout);
            },

            // i is the index of the block to fetch
            add: function (i) {
                var pool = this._p;
                // we add at index 0 (unshift)
                // if pool is at max capacity, cancel the last one and make room for this one
                if (pool.length === this._max) this.cancel(pool[this._max - 1]);

                // if block to add is not contiguous with last request, and adjacent blocks are not ready, cancel all others
                // adjacency readiness check necessary as request for adjacent block may have completed and been removed from pool
                if (i !== pool[0] - 1 && i !== pool[0] + 1 && getBlockStatus(i - 1) !== READY && getBlockStatus(i + 1) !== READY) {
                    for (var j=0; j<pool.length; j++) this.cancel(pool[j]);
                }

                pool.unshift(i);

                this._doNext();
            },
            // remove from pool
            // i is the index of the block
            remove: function (i) {
                for (var search=0; search<this._max; search++) if (this._p[search] === i) break;
                this._p.splice(search, 1);
            },
            // cancel fetch and remove from pool
            // i is the index of the block
            cancel: function (i) {
                getBlockRange(i).cancelFetch();
                this.remove(i);
            },
            dummy: null // comma protector, temporary
        };


        
        // constructor
        // bounds is an object with properties top, bottom
        function Range(bounds){
            this.top = Math.max(0, bounds.top);
            this.bottom = Math.min(dataCache.length - 1, bounds.bottom);
        }

        $.extend(Range.prototype, {
            fetchData: args.fetchData,
            cancelFetch: args.cancelFetch || function () {
                // BH problem - how do we abort xhr from here?
                // tell server we don't need it anymore
                this.markVirgin();
            },
            failFetch: function () {
                // BH ???
                // tell server we don't need it anymore
                // tell browser to cancel xhr?
                // shift pool?
                this.markUnavailable();
            },
            // apply a function for each block in this range
            // fn is a function that takes a single argument: the index of the block to operate on
            _forEachBlock: function (fn) {
                var last = getBlockIndex(this.bottom);
                for (var i=getBlockIndex(this.top); i<=last; i++) fn(i);
            },
            isDataReady: function () {
                // BH need to consider how to deal with UNAVAILABLE
                var isReady = true;
                this._forEachBlock(function (i) {
                    if (dataCache.getBlockStatus(i) !== READY) isReady = false;
                });
                return isReady;
            },
            ensureDataLoaded: function () {
                this.markUnavailable();
            },
            // apply a function for each block in this range
            // fn is a function that takes a single argument: the index of the block to operate on
            _forEachBlock: function (fn) {
                var last = getBlockIndex(this.bottom);
                for (var i=getBlockIndex(this.top); i<=last; i++) fn(i);
            },
            isDataReady: function () {
                var isReady = true;
                this._forEachBlock(function (i) {
                    if (dataCache.getBlockStatus(i) !== READY) isReady = false;
                });
                return isReady;
            },
            ensureDataLoaded: function () {
                // check if block is needed, if so, go get it. we won't repeat as we marks blocks as 'requested'
                this._forEachBlock(function (i) {
                    if (dataCache.getBlockStatus(i) === VIRGIN) getBlockRange(i).markRequested().fetchData();
                });
            },
            markRequested: function () {
                this._forEachBlock(function (i) {
                    dataCache.setBlockStatus(i, REQUESTED);
                });
                return this;
            },
            markVirgin: function () {
                this._forEachBlock(function (i) {
                    dataCache.setBlockStatus(i, VIRGIN);
                });
                return this;
            },
            markUnavailable: function () {
                this._forEachBlock(function (i) {
                    dataCache.setBlockStatus(i, UNAVAILABLE);
                });
                return this;
            },
            // Range.fetchData method's handler needs to call Range.loadData
            // cells is an object, its content is described by the optional (string) format argument, default is 'fields'
            //   'fields': array of objects, where each object represents a row and contains columns keyed by field name
            //   'indices': array of objects (or arrays), where each object represents a row and contains columns keyed by column index
            //                (column indices here map to the actual full set of columns)
            loadData: function (cells, format) {
                var me = this,
                    block = [],
                    blockIndex = getBlockIndex(me.top),
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
                    block.push(row);
                }
                pool.remove(blockIndex);
                dataCache.blocks[blockIndex] = block;
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
                var block = dataCache.blocks[getBlockIndex(i)];
                return $.isArray(block) && block[i % dataCache.blockSize];
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

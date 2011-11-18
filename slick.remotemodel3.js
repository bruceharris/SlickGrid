(function($) {
	// args: columns, url, numRows
	function makeRemoteModel(args){
		var data = {length: args.numRows};

		// events
		var onDataLoading = new Slick.Event();
		var onDataLoaded = new Slick.Event();
		var onDataLoadFailure = new Slick.Event();

		// data status codes:
		var VIRGIN = 0,
			REQUESTED = 1,
			READY = 2;

		function columnKey(colNum){
			return args.columns[colNum].field;
		} 
		function getCellStatus(row, col){
			var r = data[row];
			return (r === undefined || r && r[columnKey(col)] === undefined ? VIRGIN :
					(r[columnKey(col)] === null ? REQUESTED : READY) );
		}
		function setCellStatus(row, col, stat){
			if (!data[row]) data[row] = {};
			if (stat === VIRGIN) delete data[row][columnKey(col)];
			else if (stat === REQUESTED) data[row][columnKey(col)] = null;
		}
		// fn gets passed (el,i) and returns boolean
		function any(arr, fn){
			var l = arr.length;
			for (var i=0; i<l; i++) if (fn(arr[i], i)) return true;
			return false;
		}
		// fn gets passed (el,i) and returns boolean
		function all(arr, fn){
			var l = arr.length;
			for (var i=0; i<l; i++) if (!fn(arr[i], i)) return false;
			return true;
		}
		// range is object with properties top, bottom, left, right
		// returns an array of cell objects with properties row, col
		function getCornerCells(range){
			return [
				{row: range.top, col: range.left},
				{row: range.bottom, col: range.left},
				{row: range.top, col: range.right},
				{row: range.bottom, col: range.right}
			];
		}
		// range is object with properties top, bottom, left, right
		function anyDataNeeded(range){
			range = rationalizeRange(range);
			function isCellNeeded(cell){
				return getCellStatus(cell.row, cell.col) === VIRGIN;
			}
			return any(getCornerCells(range), isCellNeeded);
		}
		// range is object with properties top, bottom, left, right
		function isDataReady(range){
			range = rationalizeRange(range);
			function isCellReady(cell){
				return getCellStatus(cell.row, cell.col) === READY;
			}
			return all(getCornerCells(range), isCellReady);
		}
		// what is the range of the block that a given cell is in?
		function getBlockRange(row, col){
			var BLOCKSIZE = 50, // 50 * 50 cells for each block
				top = Math.floor(row / BLOCKSIZE) * BLOCKSIZE,
				left = Math.floor(col / BLOCKSIZE) * BLOCKSIZE;
			return {
				top: top,
				bottom: Math.min(top + BLOCKSIZE - 1, data.length - 1),
				left: left,
				right: Math.min(left + BLOCKSIZE - 1, args.columns.length - 1)
			};
		}
		// returns a range that is in bounds
		function rationalizeRange(range){
			return {
				top: Math.max(0, range.top),
				bottom: Math.min(data.length - 1, range.bottom),
				left: Math.max(0, range.left),
				right: Math.min(args.columns.length - 1, range.right)
			}
		}

		// range is object with properties top, bottom, left, right
		function ensureData(range) {
			range = rationalizeRange(range);

			// hmmmm... we don't really need this anymore
			if (!anyDataNeeded(range)) return;

			// for each corner of the range, check if that cell is needed,
			// if needed, go get its block. we won't repeat as getData marks cells as 'requested'
			$.each(getCornerCells(range), function(i, cell){
				if (getCellStatus(cell.row, cell.col) === VIRGIN) {
					getData(getBlockRange(cell.row, cell.col));
				}
			});
		}
		// range is object with properties top, bottom, left, right
		function getData(range){
			function markRequested(row, col){
				setCellStatus(row, col, REQUESTED);
			}
			forEachCell(range, markRequested);

			onDataLoading.notify(range);
			$.ajax({
				url: args.url + (range.top) + '/' + (range.bottom) + '/', //TODO: need the right URL that handles cols
				dataType: 'text',
				success: function(resp){
					try {
						resp = (eval('(' + resp + ')')); // there's something weird about what DWR is giving us back that requires wrapping in ()
						if (resp.reply.rc != 0) throw {
							range: range,
							rc: resp.reply.rc,
							msg: resp.reply.msg
						}
					} catch (e) {
						throw e; // TODO: how do we want to handle this? need to ensure we mark the rows as virgin
						return;
					}
					loadData(resp.reply.table.rows, range);
				},
				error: function(jqxhr, textstatus, error){
					function markVirgin(row, col){
						if (getCellStatus(row, col) === REQUESTED) setCellStatus(row, col, VIRGIN);
					}
					forEachCell(range, markVirgin);
					onDataLoadFailure.notify({range: range, textstatus: textstatus, error: error});
				}
			});
		}

		// range is object with properties top, bottom, left, right
		// fn is a function that gets called for each 'cell' in range and gets passed rowIndex, colIndex
		function forEachCell(range, fn){
			for (var r=range.top; r<=range.bottom; r++) {
				for (var c=range.left; c<=range.right; c++) {
					fn(r,c);
				}
			}
		}

		// range is object with properties top, bottom, left, right
		function loadData(resultData, range) {
			try {
				forEachCell(range, function(row, col){
					data[row][columnKey(col)] = resultData[row - range.top].cell[col - range.left];
				});
				onDataLoaded.notify(range);
			} catch (e) {
				onDataLoadFailure.notify({range: range, error: e}); // TODO: normalize the parameters that this get passed
			}
		}

		return {
			// properties
			_data: data, // exposed for debugging

			// methods
			ensureData: ensureData,
			isDataReady: isDataReady,

			// grid api methods
			getItem: function (i) { return data[i]; },
			getLength: function () { return data.length; },

			// events
			onDataLoading: onDataLoading,
			onDataLoaded: onDataLoaded,
			onDataLoadFailure: onDataLoadFailure
		};
	}

	// Slick.Data.RemoteModel
	$.extend(true, window, { Slick: { Data: { makeRemoteModel: makeRemoteModel }}});
})(jQuery);

import './Table.css';

import React, { useMemo } from 'react';

import { useComponentSize } from '../../hooks/useComponentSize/useComponentSize';
import { useForkRef } from '../../hooks/useForkRef/useForkRef';
import { IconSortDown } from '../../icons/IconSortDown/IconSortDown';
import { IconSortUp } from '../../icons/IconSortUp/IconSortUp';
import { IconUnsort } from '../../icons/IconUnsort/IconUnsort';
import { sortBy as sortByDefault, updateAt } from '../../utils/array';
import { cn } from '../../utils/bem';
import { isNotNil, isString } from '../../utils/type-guards';
import { Button, ButtonPropSize } from '../Button/Button';
import { Text } from '../Text/Text';

import { HorizontalAlign, TableCell, VerticalAlign } from './Cell/TableCell';
import { TableHeader } from './Header/TableHeader';
import { TableResizer } from './Resizer/TableResizer';
import {
  Props as TableRowsCollapseProps,
  TableRowsCollapse,
} from './RowsCollapse/TableRowsCollapse';
import {
  GetTagLabel,
  TableSelectedOptionsList,
} from './SelectedOptionsList/TableSelectedOptionsList';
import {
  fieldFiltersPresent,
  FieldSelectedValues,
  Filters,
  filterTableData,
  getSelectedFiltersList,
  isSelectedFiltersPresent,
  onSortBy,
  SelectedFilters,
  useSelectedFilters,
} from './filtering';
import {
  createSortingState,
  getColumnLeftOffset,
  getColumnsSize,
  getNewSorting,
  Header,
  Order,
  OrderType,
  Position,
  transformRows,
  useHeaderData,
  useLazyLoadData,
} from './helpers';

export { TableTextFilter } from './TextFilter/TableTextFilter';
export { TableFilterContainer } from './FilterContainer/TableFilterContainer';
export { TableNumberFilter } from './NumberFilter/TableNumberFilter';
export { TableChoiceGroupFilter } from './ChoiceGroupFilter/TableChoiceGroupFilter';

const cnTable = cn('Table');

export const sizes = ['s', 'm', 'l'] as const;
type Size = typeof sizes[number];

export const zebraStriped = ['odd', 'even'] as const;
type ZebraStriped = typeof zebraStriped[number];

export const headerVerticalAligns = ['center', 'bottom'] as const;
export type HeaderVerticalAlign = typeof headerVerticalAligns[number];

const createButtonSizeMap: Record<Size, ButtonPropSize> = {
  s: 'xs',
  m: 's',
  l: 'm',
};

type TableCSSCustomProperty = {
  '--table-width': string;
};

export type LazyLoad =
  | {
      maxVisibleRows?: number;
      scrollableEl?: HTMLDivElement | Window;
    }
  | undefined;

type ActiveRow = {
  id: string | undefined;
  onChange: ({ id, e }: { id: string | undefined; e?: React.SyntheticEvent }) => void;
};

type onRowHover = ({ id, e }: { id: string | undefined; e: React.MouseEvent }) => void;

type onRowClick = ({ id, e }: { id: string; e: React.MouseEvent }) => void;

type onRowCreate = ({ id, index, e }: { id?: string; index: number; e: React.MouseEvent }) => void;

export type TableRow = {
  id: string;
  rows?: TableRow[];
};

export type TableTreeRow<T extends TableRow> = {
  level: number;
  parentId?: string;
} & T;

export type TableFilters<T extends TableRow> = Filters<T>;

export type RowField<T extends TableRow> = Exclude<keyof T, symbol | number>;

export type ColumnWidth = number | undefined;

export type ValueOf<T> = T[keyof T];

type ColumnBase<T extends TableRow> = ValueOf<
  {
    [K in keyof T]: {
      accessor: K extends string ? K : never;
      sortable?: boolean;
      sortByField?: keyof T;
      order?: OrderType;
      sortFn?(a: T[K], b: T[K]): number;
      renderCell?: (row: T) => React.ReactNode;
      getComparisonValue?: (cell: T[K]) => number | string;
    };
  }
>;
type SingleColumnAddition<T extends TableRow> = ColumnBase<T> & { columns?: never };
type GroupColumnAddition<T extends TableRow> = {
  columns: TableColumn<T>[];
} & {
  [K in keyof ColumnBase<T>]?: never;
};
export interface TableControl<T extends TableRow> {
  column: Header<T> & ColumnMetaData;
}

export type TableColumn<T extends TableRow> = {
  title: React.ReactNode;
  align?: HorizontalAlign;
  withoutPadding?: boolean;
  width?: ColumnWidth;
  mergeCells?: boolean;
  position?: Position;
  hidden?: boolean;
  control?: ({ column }: TableControl<T>) => React.ReactNode;
} & (GroupColumnAddition<T> | SingleColumnAddition<T>);

export type TableProps<T extends TableRow> = {
  columns: TableColumn<T>[];
  rows: T[];
  filters?: Filters<T>;
  onSortBy?: onSortBy<T>;
  size?: Size;
  stickyHeader?: boolean;
  stickyColumns?: number;
  minColumnWidth?: number;
  isResizable?: boolean;
  activeRow?: ActiveRow;
  verticalAlign?: VerticalAlign;
  headerVerticalAlign?: HeaderVerticalAlign;
  zebraStriped?: ZebraStriped;
  borderBetweenRows?: boolean;
  borderBetweenColumns?: boolean;
  emptyRowsPlaceholder?: React.ReactNode;
  className?: string;
  onRowHover?: onRowHover;
  onRowClick?: onRowClick;
  onRowCreate?: onRowCreate;
  rowCreateText?: string;
  lazyLoad?: LazyLoad;
  onFiltersUpdated?: (filters: SelectedFilters) => void;
  getTagLabel?: GetTagLabel;
  isExpandedRowsByDefault?: boolean;
};

type Table = <T extends TableRow>(
  props: TableProps<T> & { ref?: React.Ref<HTMLDivElement> },
) => React.ReactElement | null;

export type ColumnMetaData = {
  filterable: boolean;
  isSortingActive: boolean;
  isFilterActive: boolean;
  isResized: boolean;
  isSticky: boolean;
  showResizer: boolean;
  columnWidth: number;
  columnLeftOffset: number;
};

export type SortingState<T extends TableRow> = {
  by: keyof T;
  order: 'asc' | 'desc';
  sortFn?: (a: T[keyof T], b: T[keyof T]) => number;
} | null;

type GetTableCellProps = {
  show: boolean;
  rowSpan: number;
  style: {
    'left'?: number;
    '--row-span'?: string;
  };
};

const getColumnSortByField = <T extends TableRow>(column: TableColumn<T>): keyof T =>
  (column.sortable && column.sortByField) || column.accessor!;

const sortingData = <T extends TableRow>(
  rows: T[],
  sorting: SortingState<T>,
  onSortBy?: onSortBy<T>,
): T[] => {
  if (onSortBy) {
    return rows;
  }

  if (!sorting) {
    return rows;
  }
  const sortedRows = sortByDefault(rows, sorting.by, sorting.order, sorting.sortFn);

  if (sortedRows.some((row) => row.rows?.length)) {
    return sortedRows.map((row) => {
      return row.rows ? { ...row, rows: sortingData(row.rows as T[], sorting, onSortBy) } : row;
    });
  }

  return sortedRows;
};

const defaultEmptyRowsPlaceholder = (
  <Text as="span" view="primary" size="s" lineHeight="s">
    Нет данных
  </Text>
);

const InternalTable = <T extends TableRow>(
  props: TableProps<T>,
  ref?: React.Ref<HTMLDivElement>,
) => {
  const {
    columns,
    rows,
    size = 'l',
    filters: rawFilters,
    isResizable = false,
    stickyHeader = false,
    stickyColumns = 0,
    minColumnWidth = 150,
    activeRow,
    verticalAlign = 'top',
    headerVerticalAlign = 'center',
    zebraStriped,
    borderBetweenRows = false,
    borderBetweenColumns = false,
    emptyRowsPlaceholder = defaultEmptyRowsPlaceholder,
    className,
    onRowHover,
    onRowClick,
    onRowCreate,
    rowCreateText = '+ Добавить строку',
    lazyLoad,
    onSortBy,
    onFiltersUpdated,
    getTagLabel,
    isExpandedRowsByDefault = false,
  } = props;
  const {
    headers,
    flattenedHeaders,
    lowHeaders,
    headerRowsRefs,
    headerRowsHeights,
    resizerTopOffsets,
  } = useHeaderData(columns);
  const stickyColumnsGrid =
    headers[0][stickyColumns - 1]?.position.gridIndex! +
    (headers[0][stickyColumns - 1]?.position.colSpan || 1);

  const getColumnsWidth = () => lowHeaders.map((column: TableColumn<T>) => column.width);
  const [resizedColumnWidths, setResizedColumnWidths] = React.useState<ColumnWidth[]>(
    getColumnsWidth(),
  );

  const filters = React.useMemo(() => {
    return rawFilters && rawFilters.filter((filter) => filter.id && filter.field);
  }, [rawFilters]);

  React.useEffect(() => {
    setResizedColumnWidths(getColumnsWidth());
  }, [lowHeaders.length]);

  const [initialColumnWidths, setInitialColumnWidths] = React.useState<number[]>([]);
  const [sorting, setSorting] = React.useState<SortingState<T>>(null);
  const [visibleFilter, setVisibleFilter] = React.useState<string | null>(null);
  const [tableScroll, setTableScroll] = React.useState({ top: 0, left: 0 });

  const tableRef = React.useRef<HTMLDivElement>(null);
  const columnsRefs = React.useRef<Record<number, HTMLDivElement | null>>({});
  const {
    selectedFilters,
    updateSelectedFilters,
    removeOneSelectedFilter,
    removeAllSelectedFilters,
  } = useSelectedFilters(filters, onFiltersUpdated);
  const [expandedRowIds, setExpandedRowIds] = React.useState<string[]>([]);

  // установка сортировки по умолчанию

  React.useEffect(() => {
    const sortingColumn = columns.find(
      (col) => isString(col.order) && Object.prototype.hasOwnProperty.call(Order, col.order),
    );
    if (sortingColumn) {
      const sortingState = createSortingState(
        getColumnSortByField(sortingColumn),
        sortingColumn.order,
        sortingColumn.sortFn,
      );
      setSorting(sortingState);
    }
  }, [columns]);

  /*
    Подписываемся на изменения размеров таблицы, но не используем значения из
    хука так как нам нужна ширина и высота таблицы без размера скролла. Этот хук
    использует значения `offsetWidth` и `offsetHeight` которые включают размер
    скролл бара.
  */
  useComponentSize(tableRef);
  const tableHeight = tableRef.current?.clientHeight || 0;
  const tableWidth = tableRef.current?.clientWidth || 0;

  const showVerticalCellShadow = tableScroll.left > 0;
  const showHorizontalCellShadow = tableScroll.top > 0;
  const isRowsClickable = activeRow && activeRow.onChange;

  const updateColumnWidth = (idx: number, newWidth: number): void => {
    setResizedColumnWidths(updateAt(resizedColumnWidths, idx, newWidth));
  };

  React.useLayoutEffect(() => {
    const columnsElements = Object.values(columnsRefs.current).filter(isNotNil);
    if (columnsElements.length === 0) return;

    const columnsElementsWidths = columnsElements.map((el) => el.getBoundingClientRect().width);
    setInitialColumnWidths(columnsElementsWidths);

    // Проверяем, что таблица отрисовалась корректно, и устанавливаем значения ширин колонок после 1го и последующих рендера
    if (
      columnsElements[0].getBoundingClientRect().left !==
        columnsElements[columnsElements.length - 1].getBoundingClientRect().left &&
      !resizedColumnWidths.some(isNotNil)
    ) {
      return setResizedColumnWidths(columnsElementsWidths);
    }

    // условие изменения ширины колонок при изменении ширины экрана (контейнера таблицы)
    if (tableWidth > 0 && !isResizable) {
      return setResizedColumnWidths(getColumnsWidth());
    }
  }, [tableWidth]);

  const isSortedByColumn = (column: TableColumn<T>): boolean =>
    getColumnSortByField(column) === sorting?.by;

  const getSortIcon = (column: TableColumn<T>) => {
    return (
      (isSortedByColumn(column) && (sorting?.order === 'desc' ? IconSortDown : IconSortUp)) ||
      IconUnsort
    );
  };

  const handleSortClick = (column: TableColumn<T>): void => {
    const newSorting = getNewSorting(
      sorting,
      getColumnSortByField(column),
      (column.sortable && column?.sortFn) || undefined,
    );

    const sortProps = newSorting
      ? {
          sortingBy: newSorting.by,
          sortOrder: newSorting.order,
        }
      : null;
    onSortBy && onSortBy(sortProps);
    setSorting(newSorting);
  };

  const handleFilterTogglerClick = (id: string) => (): void => {
    setVisibleFilter(visibleFilter === id ? null : id);
  };

  const handleTooltipSave = (
    field: string,
    tooltipSelectedFilters: FieldSelectedValues,
    value?: unknown,
  ): void => {
    updateSelectedFilters(field, tooltipSelectedFilters, value);
  };

  const removeSelectedFilter = (tableFilters: Filters<T>) => (filter: string): void => {
    removeOneSelectedFilter(tableFilters, filter);
  };

  const resetSelectedFilters = (): void => {
    if (filters && filters.length) {
      removeAllSelectedFilters(filters);
    }
  };

  const getStickyLeftOffset = (
    columnIndex: number,
    topHeaderGridIndex: number,
  ): number | undefined => {
    if (topHeaderGridIndex >= stickyColumns) {
      return;
    }

    return getColumnLeftOffset({
      columnIndex,
      resizedColumnWidths,
      initialColumnWidths,
    });
  };

  const handleScroll: React.UIEventHandler = (e) => {
    if (!(e.target instanceof HTMLElement) || e.target !== tableRef.current) {
      return;
    }

    setTableScroll({
      top: e.target.scrollTop,
      left: e.target.scrollLeft,
    });
  };

  const handleSelectRow = ({
    id,
    e,
  }: {
    id: string;
    e: React.SyntheticEvent;
  }): void | undefined => {
    if (!activeRow || !activeRow.onChange) {
      return;
    }

    activeRow.onChange({ id: activeRow.id === id ? undefined : id, e });
  };

  const handleRowHover = (id?: string) => (e: React.MouseEvent) =>
    onRowHover && onRowHover({ id, e });

  const handleRowCreate = (index: number, id?: string) => (e: React.MouseEvent) =>
    onRowCreate && onRowCreate({ e, id, index });

  const handleColumnResize = (idx: number, delta: number): void => {
    const columnMinWidth = Math.min(minColumnWidth, initialColumnWidths[idx]);
    const prevColumnWidth = resizedColumnWidths[idx] || initialColumnWidths[idx];
    const newColumnWidth = Math.max(columnMinWidth, prevColumnWidth + delta);

    updateColumnWidth(idx, newColumnWidth);

    // При расширении последней колонки скроллим таблицу вправо
    const containerEl = tableRef.current;
    if (idx === resizedColumnWidths.length - 1 && delta > 0 && containerEl) {
      containerEl.scrollBy(delta, 0);
    }
  };

  const stickyColumnsWidth = getColumnLeftOffset({
    columnIndex: stickyColumns,
    resizedColumnWidths,
    initialColumnWidths,
  });

  const columnsWithMetaData = (columns: Array<Header<T>>) => {
    return columns.map((column: Header<T>) => {
      const columnIndex = column.position.gridIndex;
      const resizedColumnWidth = resizedColumnWidths[columnIndex];
      const initialColumnWidth = initialColumnWidths[columnIndex];
      const columnWidth = resizedColumnWidth || initialColumnWidth;
      const columnLeftOffset = getColumnLeftOffset({
        columnIndex,
        resizedColumnWidths,
        initialColumnWidths,
      });
      const isResized = !!columnWidth && columnWidth !== initialColumnWidth;
      const isSticky = stickyColumns > column.position!.topHeaderGridIndex;
      const showResizer =
        stickyColumns > columnIndex ||
        stickyColumnsWidth + tableScroll.left < columnLeftOffset + columnWidth;
      const isFilterActive = (selectedFilters[column.accessor!]?.selected || []).length > 0;

      return {
        ...column,
        filterable: Boolean(filters && fieldFiltersPresent(filters, column.accessor!)),
        isSortingActive: isSortedByColumn(column),
        isFilterActive,
        isResized,
        isSticky,
        showResizer,
        columnWidth,
        columnLeftOffset,
      };
    });
  };

  const headersWithMetaData: Array<Header<T> & ColumnMetaData> = columnsWithMetaData(
    flattenedHeaders,
  );

  const hasNestedRows = React.useMemo(() => rows.some((row) => Boolean(row.rows?.length)), [rows]);

  const sortedTableData = sortingData(rows, sorting, onSortBy);

  const filteredData =
    filters && isSelectedFiltersPresent(selectedFilters)
      ? filterTableData({
          data: sortedTableData,
          filters: filters || [],
          selectedFilters,
        })
      : sortedTableData;

  const { maxVisibleRows = 210, scrollableEl = tableRef.current } = lazyLoad || {};

  const { getSlicedRows, setBoundaryRef } = useLazyLoadData(
    maxVisibleRows,
    scrollableEl,
    !!lazyLoad,
  );

  const flatRowsData = transformRows(filteredData, expandedRowIds, isExpandedRowsByDefault);
  const rowsData = getSlicedRows(flatRowsData);

  const tableStyle: React.CSSProperties & TableCSSCustomProperty = {
    'gridTemplateColumns': getColumnsSize(resizedColumnWidths),
    '--table-width': `${tableWidth}px`,
  };

  const hasMergedCells: boolean = columnsWithMetaData(lowHeaders).some(
    (header) => header.mergeCells,
  );

  const handleExpandRow = (id: string): (() => void) => {
    return (): void => {
      if (expandedRowIds.includes(id)) {
        setExpandedRowIds((prevState) => prevState.filter((rowId) => rowId !== id));
        return;
      }
      setExpandedRowIds((prevState) => [...prevState, id]);
    };
  };

  const getCollapseRollProps = (
    row: TableTreeRow<T>,
    columnIdx: number,
  ): TableRowsCollapseProps => {
    const withCollapseButton = Boolean(row.rows?.length) && columnIdx === 0;

    const baseProps = {
      level: row.level,
      isExpandedByDefault: isExpandedRowsByDefault,
    };

    if (!withCollapseButton || isExpandedRowsByDefault) {
      return baseProps;
    }

    const isExpanded = expandedRowIds.includes(row.id);
    const toggleCollapse = handleExpandRow(row.id);

    return {
      ...baseProps,
      withCollapseButton,
      isExpanded,
      toggleCollapse,
    };
  };

  const renderCell = (column: TableColumn<T>, row: T, columnIdx: number): React.ReactNode => {
    const cellContent = column.renderCell ? column.renderCell(row) : row[column.accessor!];

    if (!hasNestedRows || columnIdx !== 0) {
      return cellContent;
    }

    const collapseRollProps = getCollapseRollProps(row as TableTreeRow<T>, columnIdx);

    return <TableRowsCollapse {...collapseRollProps}>{cellContent}</TableRowsCollapse>;
  };

  const renderEmptyRowsPlaceholder = (placeholder: React.ReactNode): React.ReactNode => {
    return typeof placeholder === 'string' ? <Text size="s">{placeholder}</Text> : placeholder;
  };

  const bottomCreateRowButton = useMemo(() => {
    const rowsLength = rowsData.length;
    /* Можно и rowsData[rowsLength - 1], но в таком случае TS не подскажет,
    что мы будем искать id в undefined это может привести к ошибке */
    const { id: lastRowId } = rowsData.slice(-1).pop() ?? {};

    if (!onRowCreate) {
      return null;
    }

    return (
      <div className={cnTable(rowsLength ? 'CreatRowCell' : 'RowWithoutCells')}>
        <Button
          size={createButtonSizeMap[size]}
          form="brick"
          label={rowCreateText}
          view="clear"
          className={cnTable('CreateRowButton')}
          onClick={handleRowCreate(rowsLength, lastRowId)}
          width="full"
        />
      </div>
    );
  }, [rowCreateText, rowsData.length, onRowCreate]);

  const getTableCellProps = (
    row: TableTreeRow<T>,
    rowIdx: number,
    column: TableColumn<T>,
    columnIdx: number,
  ): GetTableCellProps => {
    const { mergeCells, accessor, position, getComparisonValue = (e) => e } = column;

    const previousCell =
      rowsData[rowIdx - 1] && getComparisonValue(rowsData[rowIdx - 1][accessor!]);
    const currentCell = getComparisonValue(row[accessor!]);

    const result: GetTableCellProps = {
      rowSpan: 1,
      show: false,
      style: {
        left: getStickyLeftOffset(columnIdx, position!.topHeaderGridIndex),
      },
    };

    if (mergeCells && ((rowsData[rowIdx - 1] && previousCell !== currentCell) || rowIdx === 0)) {
      for (let i = rowIdx; i < rowsData.length; i++) {
        if (rowsData[i + 1]) {
          const nextCell = getComparisonValue(rowsData[i + 1][accessor!]);

          if (currentCell === nextCell) {
            result.rowSpan++;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      if (result.rowSpan > 1) {
        result.style['--row-span'] = `span ${result.rowSpan}`;
      }

      result.show = true;
    }

    if (!mergeCells) {
      result.show = true;
    }

    return result;
  };

  return (
    <div
      ref={useForkRef([tableRef, ref])}
      className={cnTable(
        {
          size,
          isResizable,
          zebraStriped,
          withBorderBottom: !filteredData.length,
        },
        [className],
      )}
      style={tableStyle}
      onScroll={handleScroll}
    >
      {/*
        Элементы Resizer рендерятся в отдельных ячейках нулевой высоты с шириной
        равной ширине колонки сетки, при этом у ячейки самый большой z-index в
        таблице чтобы элементы Resizer могли перекрывать ячейки заголовка и
        контента. Кроме того это позволяет зафиксировать вертикальное и
        горизонтальное положение Resizer, а также его высоту.

        Получение высоты Resizer элементов через свойство элемента таблицы
        scrollHeight не подходило, так как в таком случае Resizer растягивал
        таблицу по высоте, поэтому от этого способа отказались.
      */}
      {columnsWithMetaData(lowHeaders).map(
        (column: TableColumn<T> & { showResizer: boolean }, columnIdx: number) => (
          <TableCell
            type="resizer"
            key={columnIdx}
            ref={(ref: HTMLDivElement | null): void => {
              columnsRefs.current[columnIdx] = ref;
            }}
            style={{
              left: getStickyLeftOffset(columnIdx, columnIdx),
            }}
            column={column}
            showVerticalShadow={showVerticalCellShadow}
          >
            {isResizable && (
              <TableResizer
                height={tableHeight - resizerTopOffsets[columnIdx]}
                top={resizerTopOffsets[columnIdx]}
                isVisible={column.showResizer}
                onResize={(delta): void => handleColumnResize(columnIdx, delta)}
                onDoubleClick={(): void =>
                  updateColumnWidth(columnIdx, initialColumnWidths[columnIdx])
                }
              />
            )}
          </TableCell>
        ),
      )}
      <TableHeader
        isStickyHeader={stickyHeader}
        headersWithMetaData={headersWithMetaData}
        headerRowsHeights={headerRowsHeights}
        headerRowsRefs={headerRowsRefs}
        getStickyLeftOffset={getStickyLeftOffset}
        stickyColumnsGrid={stickyColumnsGrid}
        showVerticalCellShadow={showVerticalCellShadow}
        headerVerticalAlign={headerVerticalAlign}
        getSortIcon={getSortIcon}
        handleSortClick={handleSortClick}
        handleFilterTogglerClick={handleFilterTogglerClick}
        handleTooltipSave={handleTooltipSave}
        filters={filters}
        visibleFilter={visibleFilter}
        selectedFilters={selectedFilters}
        showHorizontalCellShadow={showHorizontalCellShadow}
        borderBetweenColumns={borderBetweenColumns}
      />
      {filters && isSelectedFiltersPresent(selectedFilters) && (
        <div className={cnTable('RowWithoutCells')}>
          <TableSelectedOptionsList
            values={getSelectedFiltersList({ filters, selectedFilters, columns: lowHeaders })}
            getTagLabel={getTagLabel}
            onRemove={removeSelectedFilter(filters)}
            onReset={resetSelectedFilters}
          />
        </div>
      )}
      {rowsData.length > 0 ? (
        rowsData.map((row, rowIdx) => {
          const nth = (rowIdx + 1) % 2 === 0 ? 'even' : 'odd';
          return (
            <div
              key={row.id}
              role="presentation"
              className={cnTable('CellsRow', {
                nth,
                withMergedCells: hasMergedCells,
              })}
              onMouseEnter={handleRowHover(row.id)}
              onMouseLeave={handleRowHover(undefined)}
              onClick={(e) => onRowClick && onRowClick({ id: row.id, e })}
            >
              {columnsWithMetaData(lowHeaders).map((column: TableColumn<T>, columnIdx: number) => {
                const { show, style, rowSpan } = getTableCellProps(row, rowIdx, column, columnIdx);

                if (show) {
                  return (
                    <TableCell
                      type="content"
                      key={column.accessor}
                      ref={setBoundaryRef(columnIdx, rowIdx)}
                      style={style}
                      wrapperClassName={cnTable('ContentCell', {
                        isActive: activeRow ? activeRow.id === row.id : false,
                        isDarkned: activeRow
                          ? activeRow.id !== undefined && activeRow.id !== row.id
                          : false,
                        isMerged: column.mergeCells && rowSpan > 1,
                      })}
                      onClick={(e: React.SyntheticEvent): void =>
                        handleSelectRow({ id: row.id, e })
                      }
                      column={column}
                      verticalAlign={verticalAlign}
                      isClickable={!!isRowsClickable}
                      showVerticalShadow={
                        showVerticalCellShadow &&
                        column?.position!.gridIndex! + (column?.position!.colSpan || 1) ===
                          stickyColumnsGrid
                      }
                      isBorderTop={rowIdx > 0 && borderBetweenRows}
                      isBorderLeft={columnIdx > 0 && borderBetweenColumns}
                    >
                      {renderCell(column, row, columnIdx)}
                    </TableCell>
                  );
                }
                return null;
              })}
            </div>
          );
        })
      ) : (
        <div className={cnTable('RowWithoutCells')}>
          <div className={cnTable('EmptyCell')}>
            {renderEmptyRowsPlaceholder(emptyRowsPlaceholder)}
          </div>
        </div>
      )}
      {bottomCreateRowButton}
    </div>
  );
};

export const Table = React.forwardRef(InternalTable) as Table;

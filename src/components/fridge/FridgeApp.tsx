'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { addDays, format, startOfWeek } from 'date-fns';
import {
  ArrowLeft,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  Trash2,
  Utensils,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type MealKey = 'breakfast' | 'lunch' | 'dinner';

interface FridgeItem {
  id: string;
  name: string;
  qty: number;
  unit: string;
  createdAt: string;
}

interface IngredientUse {
  ingredientId: string;
  ingredientName: string;
  usedQty: number;
  unit: string;
}

interface MealEntry {
  id: string;
  date: string;
  meal: MealKey;
  dish: string;
  ingredients: IngredientUse[];
  createdAt: string;
}

interface RecipeIngredient {
  name: string;
  unit: string;
  lastUsedQty: number;
}

interface Recipe {
  id: string;
  name: string;
  times: number;
  lastCookedAt: string;
  ingredients: RecipeIngredient[];
}

interface AppData {
  items: FridgeItem[];
  entries: MealEntry[];
  recipes: Recipe[];
}

interface AddRow {
  id: string;
  name: string;
  qty: string;
  unit: string;
}

interface FridgeStore {
  data: AppData;
  addItems: (rows: AddRow[]) => void;
  deleteItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<Pick<FridgeItem, 'qty' | 'unit'>>) => void;
  cookItems: (
    ingredients: IngredientUse[],
    payload: { date: string; meal: MealKey; dish: string },
  ) => void;
  restoreEntry: (entry: MealEntry) => void;
}

const UNITS = ['个', '克', '斤', '袋', '盒', '瓶', '把', '根', '颗', '片'];
const MEALS: { key: MealKey; label: string }[] = [
  { key: 'breakfast', label: '早上' },
  { key: 'lunch', label: '中午' },
  { key: 'dinner', label: '晚上' },
];
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const FridgeContext = createContext<FridgeStore | null>(null);

export function FridgeProvider({ children }: { children: ReactNode }) {
  const store = useFridgeState();
  return <FridgeContext.Provider value={store}>{children}</FridgeContext.Provider>;
}

function emptyData(): AppData {
  return { items: [], entries: [], recipes: [] };
}

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayInputValue() {
  return format(new Date(), 'yyyy-MM-dd');
}

function numberValue(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatQty(qty: number) {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(1).replace(/\.0$/, '');
}

function mealLabel(meal: MealKey) {
  return MEALS.find((item) => item.key === meal)?.label ?? meal;
}

function ingredientSummary(ingredients: IngredientUse[]) {
  return ingredients
    .map((ingredient) => `${ingredient.ingredientName} ${formatQty(ingredient.usedQty)}${ingredient.unit}`)
    .join('、');
}

function recipeIngredientSummary(ingredients: RecipeIngredient[]) {
  return ingredients
    .map((ingredient) => (
      ingredient.lastUsedQty > 0
        ? `${ingredient.name} ${formatQty(ingredient.lastUsedQty)}${ingredient.unit}`
        : ingredient.name
    ))
    .join('、');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function toNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normaliseIngredient(value: unknown): IngredientUse | null {
  if (!isRecord(value)) return null;
  const ingredientName = toText(value.ingredientName);
  const usedQty = toNumber(value.usedQty);
  const unit = toText(value.unit);
  if (!ingredientName || usedQty <= 0 || !unit) return null;
  return {
    ingredientId: toText(value.ingredientId, newId()),
    ingredientName,
    usedQty,
    unit,
  };
}

function normaliseEntry(value: unknown): MealEntry | null {
  if (!isRecord(value)) return null;
  const date = toText(value.date);
  const meal = toText(value.meal) as MealKey;
  const dish = toText(value.dish);
  if (!date || !MEALS.some((item) => item.key === meal) || !dish) return null;

  const ingredients = Array.isArray(value.ingredients)
    ? value.ingredients.map(normaliseIngredient).filter((item): item is IngredientUse => !!item)
    : [
        normaliseIngredient({
          ingredientId: value.ingredientId,
          ingredientName: value.ingredientName,
          usedQty: value.usedQty,
          unit: value.unit,
        }),
      ].filter((item): item is IngredientUse => !!item);

  if (ingredients.length === 0) return null;
  return {
    id: toText(value.id, newId()),
    date,
    meal,
    dish,
    ingredients,
    createdAt: toText(value.createdAt, new Date().toISOString()),
  };
}

function normaliseRecipeIngredient(value: unknown): RecipeIngredient | null {
  if (typeof value === 'string') {
    return { name: value, unit: '', lastUsedQty: 0 };
  }
  if (!isRecord(value)) return null;
  const name = toText(value.name);
  if (!name) return null;
  return {
    name,
    unit: toText(value.unit),
    lastUsedQty: toNumber(value.lastUsedQty),
  };
}

function normaliseRecipe(value: unknown): Recipe | null {
  if (!isRecord(value)) return null;
  const name = toText(value.name);
  if (!name) return null;
  return {
    id: toText(value.id, newId()),
    name,
    times: Math.max(1, toNumber(value.times, 1)),
    lastCookedAt: toText(value.lastCookedAt, new Date().toISOString()),
    ingredients: Array.isArray(value.ingredients)
      ? value.ingredients
          .map(normaliseRecipeIngredient)
          .filter((item): item is RecipeIngredient => !!item)
      : [],
  };
}

function normaliseData(value: unknown): AppData {
  if (!value || typeof value !== 'object') return emptyData();
  const data = value as Partial<AppData>;
  return {
    items: Array.isArray(data.items) ? data.items : [],
    entries: Array.isArray(data.entries)
      ? data.entries.map(normaliseEntry).filter((item): item is MealEntry => !!item)
      : [],
    recipes: Array.isArray(data.recipes)
      ? data.recipes.map(normaliseRecipe).filter((item): item is Recipe => !!item)
      : [],
  };
}

async function loadFridgeData() {
  const response = await fetch('/api/fridge', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load fridge data.');
  }
  const payload = await response.json() as { data?: unknown };
  return normaliseData(payload.data);
}

async function saveFridgeData(data: AppData) {
  const response = await fetch('/api/fridge', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to save fridge data.');
  }
}

export function FridgeScreen() {
  const {
    data,
    addItems,
    deleteItem,
    updateItem,
    cookItems,
  } = useFridgeStore();
  const [adding, setAdding] = useState(false);
  const [planningItems, setPlanningItems] = useState<FridgeItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [notice, setNotice] = useState('');
  const pointerStart = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  if (adding) {
    return <AddItemsScreen onBack={() => setAdding(false)} onSave={addItems} />;
  }

  const clearLongPress = () => {
    if (!longPressTimer.current) return;
    clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const enterSelection = (item: FridgeItem) => {
    setSelecting(true);
    setSelectedIds(new Set([item.id]));
    setSwipedId(null);
  };

  const toggleSelected = (item: FridgeItem) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      if (next.size === 0) {
        setSelecting(false);
      }
      return next;
    });
  };

  const visibleItems = data.items.filter((item) => item.qty > 0);
  const selectedItems = visibleItems.filter((item) => selectedIds.has(item.id));

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2200);
  };

  const handleQtyChange = (item: FridgeItem, value: string) => {
    const qty = numberValue(value);
    if (qty <= 0) {
      showNotice('数量不能改成 0，请滑动删除食材。');
      return;
    }
    updateItem(item.id, { qty });
  };

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">当前库存</p>
          <h1 className="text-2xl font-semibold tracking-normal">冰箱</h1>
        </div>
        <Button
          type="button"
          size="icon-lg"
          aria-label="添加食材"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </header>

      {notice ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {notice}
        </div>
      ) : null}

      <div className="space-y-2">
        {visibleItems.length === 0 ? (
          <EmptyState title="暂无食材" action="添加" onAction={() => setAdding(true)} />
        ) : (
          visibleItems.map((item) => {
            const selected = selectedIds.has(item.id);
            return (
              <div key={item.id} className="relative overflow-hidden rounded-lg bg-destructive/10">
                {!selecting ? (
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-20 items-center justify-center text-destructive"
                    onClick={() => {
                      deleteItem(item.id);
                      setSwipedId(null);
                    }}
                    aria-label={`删除${item.name}`}
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={cn(
                    'relative z-10 flex min-h-20 w-full items-center gap-3 rounded-lg border bg-card px-3 py-3 text-left shadow-sm transition-transform',
                    selected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
                    !selecting && swipedId === item.id && '-translate-x-20',
                  )}
                  style={{ touchAction: 'pan-y' }}
                  onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
                    pointerStart.current = event.clientX;
                    suppressClick.current = false;
                    if (!selecting && swipedId !== item.id) {
                      longPressTimer.current = setTimeout(() => {
                        suppressClick.current = true;
                        enterSelection(item);
                      }, 450);
                    }
                  }}
                  onPointerMove={(event: PointerEvent<HTMLButtonElement>) => {
                    if (Math.abs(event.clientX - pointerStart.current) > 12) {
                      clearLongPress();
                    }
                  }}
                  onPointerCancel={clearLongPress}
                  onPointerUp={(event: PointerEvent<HTMLButtonElement>) => {
                    clearLongPress();
                    const delta = event.clientX - pointerStart.current;
                    if (selecting) return;
                    if (delta < -48) {
                      setSwipedId(item.id);
                      suppressClick.current = true;
                    } else if (delta > 48) {
                      setSwipedId(null);
                      suppressClick.current = true;
                    }
                  }}
                  onClick={() => {
                    if (suppressClick.current) return;
                    if (selecting) {
                      toggleSelected(item);
                      return;
                    }
                    if (swipedId === item.id) {
                      setSwipedId(null);
                      return;
                    }
                    setPlanningItems([item]);
                  }}
                >
                  <span className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
                    selected ? 'bg-primary text-primary-foreground' : 'bg-accent text-primary',
                  )}>
                    {selecting ? <Check className={cn('h-5 w-5', !selected && 'opacity-0')} /> : <Utensils className="h-5 w-5" />}
                  </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium">{item.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {selecting ? '点按切换选择' : '点按安排，长按多选'}
                  </span>
                </span>
                <span className="flex w-32 shrink-0 items-center justify-end gap-1.5">
                  {selecting ? (
                    <span className="rounded-lg bg-muted px-2.5 py-2 text-sm text-muted-foreground">
                      {formatQty(item.qty)}{item.unit}
                    </span>
                  ) : (
                    <>
                      <Input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={item.qty}
                        className="h-9 text-right"
                        aria-label={`${item.name}数量`}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => handleQtyChange(item, event.target.value)}
                      />
                      <select
                        value={item.unit}
                        className="h-9 w-14 rounded-lg border border-input bg-background px-1.5 text-sm outline-none"
                        aria-label={`${item.name}单位`}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => updateItem(item.id, { unit: event.target.value })}
                      >
                        {UNITS.map((unit) => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </>
                  )}
                </span>
              </button>
            </div>
            );
          })
        )}
      </div>

      {selecting && selectedItems.length > 0 ? (
        <div className="fixed inset-x-0 bottom-[72px] z-40 px-4">
          <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-lg border border-border bg-background p-2 shadow-lg">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelecting(false);
                setSelectedIds(new Set());
              }}
            >
              取消
            </Button>
            <p className="flex-1 text-sm font-medium">已选 {selectedItems.length} 项</p>
            <Button type="button" size="sm" onClick={() => setPlanningItems(selectedItems)}>
              安排做菜
            </Button>
          </div>
        </div>
      ) : null}

      {planningItems.length > 0 ? (
        <PlanMealSheet
          items={planningItems}
          onClose={() => setPlanningItems([])}
          onSave={(payload) => {
            cookItems(payload.ingredients, {
              date: payload.date,
              meal: payload.meal,
              dish: payload.dish,
            });
            setPlanningItems([]);
            setSelecting(false);
            setSelectedIds(new Set());
          }}
        />
      ) : null}
    </section>
  );
}

export function CalendarScreen() {
  const { data } = useFridgeStore();
  const [weekOffset, setWeekOffset] = useState(0);
  const [detail, setDetail] = useState<{
    date: string;
    dayLabel: string;
    meal: MealKey;
    entries: MealEntry[];
  } | null>(null);
  const days = useMemo(() => {
    const start = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [weekOffset]);

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">按周查看</p>
          <h1 className="text-2xl font-semibold tracking-normal">日历</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" aria-label="上一周" onClick={() => setWeekOffset((value) => value - 1)}>
            <ChevronLeft />
          </Button>
          <Button type="button" variant="outline" size="icon" aria-label="下一周" onClick={() => setWeekOffset((value) => value + 1)}>
            <ChevronRight />
          </Button>
        </div>
      </header>

      <div className="space-y-3">
        {days.map((day, dayIndex) => {
          const date = format(day, 'yyyy-MM-dd');
          const entries = data.entries.filter((entry) => entry.date === date);
          return (
            <div key={date} className="rounded-lg border border-border bg-card p-3 shadow-sm">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-medium">{WEEKDAYS[dayIndex]}</h2>
                <span className="text-sm text-muted-foreground">{format(day, 'MM.dd')}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MEALS.map((meal) => {
                  const mealEntries = entries.filter((entry) => entry.meal === meal.key);
                  const previewEntries = mealEntries.slice(0, 2);
                  return (
                    <button
                      key={meal.key}
                      type="button"
                      className="min-h-24 rounded-md bg-muted/60 p-2 text-left disabled:cursor-default"
                      disabled={mealEntries.length === 0}
                      onClick={() => {
                        setDetail({
                          date,
                          dayLabel: `${WEEKDAYS[dayIndex]} ${format(day, 'MM.dd')}`,
                          meal: meal.key,
                          entries: mealEntries,
                        });
                      }}
                    >
                      <p className="mb-2 text-xs font-medium text-muted-foreground">{meal.label}</p>
                      {mealEntries.length > 0 ? (
                        <div className="space-y-1.5">
                          {previewEntries.map((entry) => (
                            <div key={entry.id} className="rounded-md bg-background px-2 py-1.5 text-xs">
                              <p className="font-medium text-foreground">{entry.dish}</p>
                              <p className="truncate text-muted-foreground">
                                {ingredientSummary(entry.ingredients)}
                              </p>
                            </div>
                          ))}
                          {mealEntries.length > previewEntries.length ? (
                            <p className="px-1 text-xs text-muted-foreground">
                              还有 {mealEntries.length - previewEntries.length} 个
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">空</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {detail ? (
        <MealDetailSheet detail={detail} onClose={() => setDetail(null)} />
      ) : null}
    </section>
  );
}

export function RecipesScreen() {
  const { data } = useFridgeStore();
  const recipes = [...data.recipes].sort((a, b) => b.lastCookedAt.localeCompare(a.lastCookedAt));

  return (
    <section className="space-y-4">
      <header>
        <p className="text-sm text-muted-foreground">做过的菜</p>
        <h1 className="text-2xl font-semibold tracking-normal">菜谱</h1>
      </header>

      <div className="space-y-2">
        {recipes.length === 0 ? (
          <EmptyState title="暂无菜谱" />
        ) : (
          recipes.map((recipe) => (
            <article key={recipe.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-medium">{recipe.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {recipeIngredientSummary(recipe.ingredients) || '未记录食材'}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-accent px-2 py-1 text-sm text-primary">
                  {recipe.times}次
                </span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export function ProfileScreen() {
  const { data, restoreEntry } = useFridgeStore();
  const totals = useMemo(() => {
    const grouped = new Map<string, { name: string; unit: string; qty: number }>();
    data.entries.forEach((entry) => {
      entry.ingredients.forEach((ingredient) => {
        const key = `${ingredient.ingredientName}-${ingredient.unit}`;
        const current = grouped.get(key) ?? {
          name: ingredient.ingredientName,
          unit: ingredient.unit,
          qty: 0,
        };
        current.qty += ingredient.usedQty;
        grouped.set(key, current);
      });
    });
    return [...grouped.values()].sort((a, b) => b.qty - a.qty);
  }, [data.entries]);

  return (
    <section className="space-y-4">
      <header>
        <p className="text-sm text-muted-foreground">统计与恢复</p>
        <h1 className="text-2xl font-semibold tracking-normal">我的</h1>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <StatTile icon={BarChart3} label="做菜数目" value={`${data.entries.length}`} />
        <StatTile icon={Utensils} label="菜谱数量" value={`${data.recipes.length}`} />
      </div>

      <section className="space-y-2">
        <h2 className="text-base font-medium">食材总消耗量</h2>
        {totals.length === 0 ? (
          <EmptyState title="暂无消耗" />
        ) : (
          totals.map((item) => (
            <div key={`${item.name}-${item.unit}`} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-3 shadow-sm">
              <span className="font-medium">{item.name}</span>
              <span className="text-muted-foreground">{formatQty(item.qty)}{item.unit}</span>
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-medium">消耗记录</h2>
        {data.entries.length === 0 ? (
          <EmptyState title="暂无记录" />
        ) : (
          [...data.entries]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((entry) => (
              <article key={entry.id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{entry.dish}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {entry.date} {mealLabel(entry.meal)} · {ingredientSummary(entry.ingredients)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => restoreEntry(entry)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    提取
                  </Button>
                </div>
              </article>
            ))
        )}
      </section>
    </section>
  );
}

function useFridgeStore() {
  const store = useContext(FridgeContext);
  if (!store) {
    throw new Error('useFridgeStore must be used inside FridgeProvider');
  }
  return store;
}

function useFridgeState(): FridgeStore {
  const [data, setData] = useState<AppData>(emptyData);
  const [loaded, setLoaded] = useState(false);
  const dataRef = useRef<AppData>(emptyData());

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const next = await loadFridgeData();
        if (cancelled) return;
        dataRef.current = next;
        setData(next);
      } catch {
        if (cancelled) return;
        dataRef.current = emptyData();
        setData(emptyData());
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const commitData = (next: AppData) => {
    dataRef.current = next;
    setData(next);
    if (!loaded) return;
    void saveFridgeData(next);
  };

  const addItems = (rows: AddRow[]) => {
    const now = new Date().toISOString();
    const current = dataRef.current;
    const items = [...current.items];
    rows.forEach((row) => {
      const name = row.name.trim();
      const qty = numberValue(row.qty);
      if (!name || qty <= 0) return;
      const unit = row.unit || UNITS[0];
      const existingIndex = items.findIndex((item) => item.name === name && item.unit === unit);
      if (existingIndex >= 0) {
        items[existingIndex] = {
          ...items[existingIndex],
          qty: items[existingIndex].qty + qty,
        };
      } else {
        items.push({ id: newId(), name, qty, unit, createdAt: now });
      }
    });
    commitData({ ...current, items });
  };

  const deleteItem = (id: string) => {
    const current = dataRef.current;
    commitData({
      ...current,
      items: current.items.filter((item) => item.id !== id),
    });
  };

  const updateItem = (id: string, patch: Partial<Pick<FridgeItem, 'qty' | 'unit'>>) => {
    const current = dataRef.current;
    commitData({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  };

  const cookItems = (
    ingredients: IngredientUse[],
    payload: { date: string; meal: MealKey; dish: string },
  ) => {
    const validIngredients = ingredients.filter((ingredient) => ingredient.usedQty > 0);
    if (!payload.dish.trim() || validIngredients.length === 0) return;
    const now = new Date().toISOString();
    const dish = payload.dish.trim();
    const entry: MealEntry = {
      id: newId(),
      date: payload.date,
      meal: payload.meal,
      dish,
      ingredients: validIngredients,
      createdAt: now,
    };

    const current = dataRef.current;
    const items = current.items.map((currentItem) => {
      const ingredient = validIngredients.find((item) => item.ingredientId === currentItem.id);
      if (!ingredient) return currentItem;
      return {
        ...currentItem,
        qty: Math.max(0, currentItem.qty - ingredient.usedQty),
      };
    });
    const recipeIndex = current.recipes.findIndex((recipe) => recipe.name === dish);
    const recipes = [...current.recipes];
    const recipeIngredients = validIngredients.map((ingredient) => ({
      name: ingredient.ingredientName,
      unit: ingredient.unit,
      lastUsedQty: ingredient.usedQty,
    }));
    if (recipeIndex >= 0) {
      const recipe = recipes[recipeIndex];
      const mergedIngredients = [...recipe.ingredients];
      recipeIngredients.forEach((ingredient) => {
        const existingIndex = mergedIngredients.findIndex((item) => item.name === ingredient.name);
        if (existingIndex >= 0) {
          mergedIngredients[existingIndex] = ingredient;
        } else {
          mergedIngredients.push(ingredient);
        }
      });
      recipes[recipeIndex] = {
        ...recipe,
        times: recipe.times + 1,
        lastCookedAt: now,
        ingredients: mergedIngredients,
      };
    } else {
      recipes.push({
        id: newId(),
        name: dish,
        times: 1,
        lastCookedAt: now,
        ingredients: recipeIngredients,
      });
    }
    commitData({ items, entries: [...current.entries, entry], recipes });
  };

  const restoreEntry = (entry: MealEntry) => {
    const restoredText = entry.ingredients
      .map((ingredient) => `${ingredient.ingredientName} ${formatQty(ingredient.usedQty)}${ingredient.unit}`)
      .join('、');
    const confirmed = window.confirm(
      `这会从日历删除「${entry.dish}」，并恢复冰箱库存：${restoredText}。`,
    );
    if (!confirmed) return;

    const current = dataRef.current;
    const items = [...current.items];
    entry.ingredients.forEach((ingredient) => {
      const existingIndex = items.findIndex((item) => item.id === ingredient.ingredientId);
      if (existingIndex >= 0) {
        items[existingIndex] = {
          ...items[existingIndex],
          qty: items[existingIndex].qty + ingredient.usedQty,
        };
      } else {
        items.push({
          id: ingredient.ingredientId,
          name: ingredient.ingredientName,
          qty: ingredient.usedQty,
          unit: ingredient.unit,
          createdAt: new Date().toISOString(),
        });
      }
    });

    const recipes = current.recipes
      .map((recipe) => (
        recipe.name === entry.dish
          ? { ...recipe, times: recipe.times - 1 }
          : recipe
      ))
      .filter((recipe) => recipe.times > 0);

    commitData({
      items,
      entries: current.entries.filter((item) => item.id !== entry.id),
      recipes,
    });
  };

  return { data, addItems, deleteItem, updateItem, cookItems, restoreEntry };
}

function AddItemsScreen({
  onBack,
  onSave,
}: {
  onBack: () => void;
  onSave: (rows: AddRow[]) => void;
}) {
  const [rows, setRows] = useState<AddRow[]>([makeAddRow()]);

  const updateRow = (id: string, patch: Partial<AddRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    setRows((current) => (current.length === 1 ? current : current.filter((row) => row.id !== id)));
  };

  const save = () => {
    onSave(rows);
    onBack();
  };

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="icon" aria-label="返回" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <h1 className="flex-1 text-xl font-semibold tracking-normal">添加食材</h1>
        <Button type="button" size="sm" onClick={save}>保存</Button>
      </header>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[1fr_72px_64px_36px] gap-2 rounded-lg border border-border bg-card p-2 shadow-sm">
            <Input
              value={row.name}
              placeholder="菜名"
              aria-label="菜名"
              onChange={(event) => updateRow(row.id, { name: event.target.value })}
            />
            <Input
              type="number"
              min="0"
              step="0.1"
              value={row.qty}
              placeholder="数量"
              aria-label="数量"
              onChange={(event) => updateRow(row.id, { qty: event.target.value })}
            />
            <select
              value={row.unit}
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none"
              aria-label="单位"
              onChange={(event) => updateRow(row.id, { unit: event.target.value })}
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="删除此行"
              onClick={() => removeRow(row.id)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" className="w-full" onClick={() => setRows((current) => [...current, makeAddRow()])}>
        <Plus className="h-4 w-4" />
        增加一行
      </Button>
    </section>
  );
}

function PlanMealSheet({
  items,
  onClose,
  onSave,
}: {
  items: FridgeItem[];
  onClose: () => void;
  onSave: (payload: { date: string; meal: MealKey; dish: string; ingredients: IngredientUse[] }) => void;
}) {
  const [date, setDate] = useState(todayInputValue);
  const [meal, setMeal] = useState<MealKey>('dinner');
  const [dish, setDish] = useState('');
  const [uses, setUses] = useState<Record<string, string>>(() => (
    Object.fromEntries(items.map((item) => [item.id, String(Math.min(1, item.qty || 1))]))
  ));
  const ingredients = items
    .map((item) => ({
      ingredientId: item.id,
      ingredientName: item.name,
      usedQty: Math.min(numberValue(uses[item.id]), item.qty),
      unit: item.unit,
    }))
    .filter((ingredient) => ingredient.usedQty > 0);
  const canSave = dish.trim().length > 0 && ingredients.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-foreground/20 px-3 pb-3" onClick={onClose}>
      <form
        className="mx-auto max-h-[88dvh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ date, meal, dish, ingredients });
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">已选 {items.length} 项食材</p>
            <h2 className="text-lg font-semibold tracking-normal">安排做菜</h2>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>取消</Button>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <label className="space-y-1.5">
            <span className="text-sm text-muted-foreground">日期</span>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {MEALS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={cn(
                'h-10 rounded-lg border border-border text-sm font-medium',
                meal === option.key ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground',
              )}
              onClick={() => setMeal(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="space-y-1.5">
          <span className="text-sm text-muted-foreground">菜名</span>
          <Input value={dish} placeholder="例如 西红柿炒蛋" onChange={(event) => setDish(event.target.value)} />
        </label>

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">食材用量</h3>
          {items.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_88px_36px] items-center gap-2 rounded-lg border border-border bg-card p-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">剩余 {formatQty(item.qty)}{item.unit}</p>
              </div>
              <Input
                type="number"
                min="0"
                max={item.qty}
                step="0.1"
                value={uses[item.id] ?? ''}
                className="text-right"
                aria-label={`${item.name}消耗数量`}
                onChange={(event) => {
                  setUses((current) => ({ ...current, [item.id]: event.target.value }));
                }}
              />
              <span className="text-sm text-muted-foreground">{item.unit}</span>
            </div>
          ))}
        </section>

        <Button type="submit" className="w-full" disabled={!canSave}>
          保存安排
        </Button>
      </form>
    </div>
  );
}

function MealDetailSheet({
  detail,
  onClose,
}: {
  detail: {
    date: string;
    dayLabel: string;
    meal: MealKey;
    entries: MealEntry[];
  };
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-foreground/20 px-3 pb-3" onClick={onClose}>
      <div
        className="mx-auto max-h-[82dvh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{detail.dayLabel} · {detail.date}</p>
            <h2 className="text-lg font-semibold tracking-normal">{mealLabel(detail.meal)}</h2>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>关闭</Button>
        </div>

        <div className="space-y-2">
          {detail.entries.map((entry) => (
            <article key={entry.id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
              <h3 className="font-medium">{entry.dish}</h3>
              <div className="mt-2 space-y-1.5">
                {entry.ingredients.map((ingredient) => (
                  <div
                    key={`${entry.id}-${ingredient.ingredientId}`}
                    className="flex items-center justify-between rounded-md bg-muted/60 px-2 py-1.5 text-sm"
                  >
                    <span>{ingredient.ingredientName}</span>
                    <span className="text-muted-foreground">
                      {formatQty(ingredient.usedQty)}{ingredient.unit}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <Icon className="mb-3 h-5 w-5 text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function EmptyState({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/70 px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{title}</p>
      {action && onAction ? (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onAction}>
          <Plus className="h-4 w-4" />
          {action}
        </Button>
      ) : null}
    </div>
  );
}

function makeAddRow(): AddRow {
  return { id: newId(), name: '', qty: '', unit: UNITS[0] };
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Coins, Diamond, Edit2, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AdminHeading,
  AdminPage,
  ConfirmDialog,
  FilterChips,
  Panel,
  StatusPill,
} from "@/components/admin/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  currencyLabel,
  DEFAULT_PRODUCTS,
  formatProductPrice,
  normalizeProductReward,
  type PaymentProduct,
  type RewardCurrency,
} from "@/lib/payments/products";
import {
  deleteAdminProduct,
  fetchAdminProducts,
  reorderAdminProducts,
  saveAdminProduct,
  seedMissingAdminProducts,
  toggleAdminProduct,
} from "@/lib/payments/products-admin";

export const Route = createFileRoute("/admin/products")({
  head: () => ({
    meta: [
      { title: "Currency Products — Admin Dashboard" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Manage Coin and Diamond packages available in the Civil Craft shop.",
      },
    ],
  }),
  component: AdminProductsPage,
});

const filters = ["All", "Active", "Disabled"] as const;
type Filter = (typeof filters)[number];

interface ProductFormData {
  id?: string;
  name: string;
  rewardCurrency: RewardCurrency;
  rewardAmount: number | string;
  pricePhp: number | string;
  description: string;
  badge?: string;
  popular: boolean;
  active: boolean;
}

const emptyForm: ProductFormData = {
  name: "",
  rewardCurrency: "CO",
  rewardAmount: 500,
  pricePhp: 50,
  description: "",
  badge: "",
  popular: false,
  active: true,
};

function AdminProductsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("All");
  const [currencyFilter, setCurrencyFilter] = useState<"All" | "Coins" | "Diamonds">("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<PaymentProduct | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(emptyForm);
  const [deleteCandidate, setDeleteCandidate] = useState<PaymentProduct | null>(null);

  const query = useQuery({
    queryKey: ["admin", "products"],
    queryFn: fetchAdminProducts,
    staleTime: 10_000,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const rewardAmount = Number(data.rewardAmount);
      const pricePhp = Number(data.pricePhp);
      if (!Number.isSafeInteger(rewardAmount) || rewardAmount <= 0) {
        throw new Error("Reward amount must be a positive integer.");
      }
      if (!Number.isFinite(pricePhp) || pricePhp <= 0) {
        throw new Error("Price in PHP must be greater than zero.");
      }

      // Convert PHP to centavos (₱50.00 -> 5000 centavos)
      const amount = Math.round(pricePhp * 100);
      if (!Number.isSafeInteger(amount) || Math.abs(amount / 100 - pricePhp) > 0.00000001) {
        throw new Error("Price must use at most two decimal places.");
      }

      // Generate clean ID from name/coins if new
      const id =
        data.id || `${data.rewardCurrency === "DI" ? "diamonds" : "coins"}_${rewardAmount}`;
      const cleanId = id.trim().toLowerCase();
      if (!/^[a-z0-9_-]{2,64}$/.test(cleanId)) {
        throw new Error("Product ID must contain only letters, numbers, underscores, and hyphens.");
      }
      if (!editingProduct && (query.data || []).some((p) => p.id === cleanId)) {
        throw new Error(
          "That product ID already exists. Edit the existing package or choose a different ID.",
        );
      }

      return await saveAdminProduct({
        id: cleanId,
        name: data.name.trim(),
        description: data.description.trim(),
        rewardCurrency: data.rewardCurrency,
        rewardAmount,
        rewardCoins: data.rewardCurrency === "CO" ? rewardAmount : 0,
        amount,
        currency: "PHP",
        category: "currency",
        badge: data.badge?.trim() || undefined,
        popular: data.popular,
        active: data.active,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["admin", "products"], updated);
      queryClient.invalidateQueries({ queryKey: ["shop-products"] });
      toast.success(editingProduct ? "Product updated successfully!" : "New product created!");
      setDialogOpen(false);
      setEditingProduct(null);
      setFormData(emptyForm);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save product.");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      return await toggleAdminProduct(id, active);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["admin", "products"], updated);
      queryClient.invalidateQueries({ queryKey: ["shop-products"] });
      toast.success("Product status updated.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to toggle product status.");
    },
  });

  const seedMutation = useMutation({
    mutationFn: seedMissingAdminProducts,
    onSuccess: (updated) => {
      queryClient.setQueryData(["admin", "products"], updated);
      queryClient.invalidateQueries({ queryKey: ["shop-products"] });
      toast.success("Missing default packages added. Existing products were preserved.");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Failed to add missing packages."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await deleteAdminProduct(id);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["admin", "products"], updated);
      queryClient.invalidateQueries({ queryKey: ["shop-products"] });
      toast.success("Product deleted successfully.");
      setDeleteCandidate(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete product.");
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      return await reorderAdminProducts(orderedIds);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["admin", "products"], updated);
      queryClient.invalidateQueries({ queryKey: ["shop-products"] });
      toast.success("Product order updated.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to reorder products.");
    },
  });

  const openCreateDialog = () => {
    setEditingProduct(null);
    setFormData({ ...emptyForm, rewardCurrency: currencyFilter === "Diamonds" ? "DI" : "CO" });
    setDialogOpen(true);
  };

  const openEditDialog = (product: PaymentProduct) => {
    setEditingProduct(product);
    setFormData({
      id: product.id,
      name: product.name,
      ...normalizeProductReward(product),
      pricePhp: (product.amount / 100).toFixed(2),
      description: product.description,
      badge: product.badge || "",
      popular: product.popular || false,
      active: product.active !== false,
    });
    setDialogOpen(true);
  };

  const handleMove = (id: string, direction: -1 | 1) => {
    const list = [...(query.data || [])];
    const visibleIndex = filteredProducts.findIndex((p) => p.id === id);
    const target = filteredProducts[visibleIndex + direction];
    if (!target) return;
    const index = list.findIndex((p) => p.id === id);
    const targetIndex = list.findIndex((p) => p.id === target.id);
    const moved = list[index];
    if (!moved || targetIndex < 0) return;
    list[index] = target;
    list[targetIndex] = moved;

    const orderedIds = list.map((p) => p.id);
    reorderMutation.mutate(orderedIds);
  };

  const products = query.data || [];
  const filteredProducts = products.filter((p) => {
    if (
      currencyFilter !== "All" &&
      currencyLabel(normalizeProductReward(p).rewardCurrency) !== currencyFilter
    )
      return false;
    if (filter === "Active") return p.active !== false;
    if (filter === "Disabled") return p.active === false;
    return true;
  });

  const activeCount = products.filter((p) => p.active !== false).length;
  const totalCoins = products
    .filter((p) => p.active !== false && normalizeProductReward(p).rewardCurrency === "CO")
    .reduce((sum, p) => sum + normalizeProductReward(p).rewardAmount, 0);
  const totalDiamonds = products
    .filter((p) => p.active !== false && normalizeProductReward(p).rewardCurrency === "DI")
    .reduce((sum, p) => sum + normalizeProductReward(p).rewardAmount, 0);
  const missingDefaults = DEFAULT_PRODUCTS.some(
    (p) => !products.some((stored) => stored.id === p.id),
  );

  return (
    <AdminPage>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <AdminHeading
          title="Currency Products"
          description="Manage separate Coin and Diamond packages. Diamond checkout stays unavailable until the premium wallet is configured and verified."
        />
        <Button onClick={openCreateDialog} variant="gold" className="shrink-0 font-bold">
          <Plus className="mr-1.5 h-4 w-4" /> Add Currency Product
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border-2 border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Total Products
          </p>
          <p className="mt-1 text-2xl font-extrabold text-foreground">
            {query.data ? products.length : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Configured in Title Internal Data</p>
        </div>
        <div className="rounded-xl border-2 border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Active in Shop
          </p>
          <p className="mt-1 text-2xl font-extrabold text-gold">{query.data ? activeCount : "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Available to players right now</p>
        </div>
        <div className="rounded-xl border-2 border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Active Coin Packages
          </p>
          <p className="mt-1 text-2xl font-extrabold text-foreground">
            {query.data ? totalCoins.toLocaleString() : "—"} CO
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Sum of active packages</p>
        </div>
        <div className="rounded-xl border-2 border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Active Diamond Packages
          </p>
          <p className="mt-1 text-2xl font-extrabold text-foreground">
            {query.data ? totalDiamonds.toLocaleString() : "—"} DI
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Separate from Coins and game gold</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterChips
          options={["All", "Coins", "Diamonds"] as const}
          value={currencyFilter}
          onChange={setCurrencyFilter}
        />
        <FilterChips options={filters} value={filter} onChange={setFilter} />
      </div>
      {query.isSuccess && missingDefaults && (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Add missing starter packages without changing existing prices, quantities, or disabled
            products. Catalogue reads never restore defaults automatically.
          </p>
          <Button
            variant="outline"
            className="min-h-11 shrink-0"
            disabled={seedMutation.isPending}
            onClick={() => seedMutation.mutate()}
          >
            {seedMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add Missing Defaults
          </Button>
        </div>
      )}

      {query.isPending ? (
        <LoadingState label="Loading currency products catalog…" rows={3} />
      ) : query.isError ? (
        <ErrorState
          title="Unable to load currency products"
          description={(query.error as Error).message}
          onRetry={() => query.refetch()}
        />
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          title="No currency products found"
          description={
            filter === "All"
              ? "No packages match this currency. Add a currency product or use Add Missing Defaults."
              : `No products match the filter '${filter}'.`
          }
        />
      ) : (
        <Panel
          title={`Products Catalog (${filteredProducts.length})`}
          icon={Coins}
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b-2 border-border bg-secondary/40 text-left">
                <tr className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-4 py-2.5 w-12 text-center">Order</th>
                  <th className="px-4 py-2.5">Product & ID</th>
                  <th className="px-4 py-2.5">Reward</th>
                  <th className="px-4 py-2.5">Price</th>
                  <th className="px-4 py-2.5">Description</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p, index) => {
                  const isActive = p.active !== false;
                  const reward = normalizeProductReward(p);
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-11 w-11"
                            disabled={index === 0 || reorderMutation.isPending}
                            onClick={() => handleMove(p.id, -1)}
                            aria-label="Move up"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-11 w-11"
                            disabled={
                              index === filteredProducts.length - 1 || reorderMutation.isPending
                            }
                            onClick={() => handleMove(p.id, 1)}
                            aria-label="Move down"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-foreground">{p.name}</span>
                          {p.badge && (
                            <Badge
                              variant="outline"
                              className="text-xs border-gold text-gold font-bold"
                            >
                              {p.badge}
                            </Badge>
                          )}
                          {p.popular && (
                            <Badge
                              variant="default"
                              className="text-xs bg-gold text-gold-foreground font-bold"
                            >
                              Popular
                            </Badge>
                          )}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground mt-0.5">
                          id: {p.id}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-gold">
                        <span className="flex items-center gap-1.5">
                          {reward.rewardCurrency === "DI" ? (
                            <Diamond className="h-4 w-4 text-sky-500" />
                          ) : (
                            <Coins className="h-4 w-4" />
                          )}
                          {reward.rewardAmount.toLocaleString()} {reward.rewardCurrency}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {currencyLabel(reward.rewardCurrency)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {formatProductPrice(p.amount, p.currency)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                        {p.description}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill tone={isActive ? "ok" : "off"}>
                          {isActive ? "Active" : "Disabled"}
                        </StatusPill>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-11 px-2 font-semibold"
                            onClick={() => toggleMutation.mutate({ id: p.id, active: !isActive })}
                            disabled={toggleMutation.isPending}
                          >
                            {isActive ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-11 px-2"
                            onClick={() => openEditDialog(p)}
                          >
                            <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-11 min-w-11 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label={`Delete ${p.name}`}
                            onClick={() => setDeleteCandidate(p)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Add / Edit Product Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingProduct ? "Edit Currency Product" : "Add New Currency Product"}
            </DialogTitle>
            <DialogDescription>
              {editingProduct
                ? "Update product details, pricing, and display settings."
                : "Create a Coin or Diamond package. Checkout availability also depends on server payment and wallet configuration."}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(formData);
            }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="prod-name">Product Name *</Label>
              <Input
                id="prod-name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={`e.g. 5,000 Civil Craft ${currencyLabel(formData.rewardCurrency)}`}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prod-currency">Reward Currency *</Label>
              <select
                id="prod-currency"
                value={formData.rewardCurrency}
                className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                onChange={(e) =>
                  setFormData({ ...formData, rewardCurrency: e.target.value as RewardCurrency })
                }
              >
                <option value="CO">Coins (CO)</option>
                <option value="DI">Diamonds (DI)</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prod-reward">
                  {currencyLabel(formData.rewardCurrency)} Reward ({formData.rewardCurrency}) *
                </Label>
                <Input
                  id="prod-reward"
                  type="number"
                  min="1"
                  required
                  value={formData.rewardAmount}
                  onChange={(e) => setFormData({ ...formData, rewardAmount: e.target.value })}
                  placeholder="5000"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prod-price">Price in PHP (₱) *</Label>
                <Input
                  id="prod-price"
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={formData.pricePhp}
                  onChange={(e) => setFormData({ ...formData, pricePhp: e.target.value })}
                  placeholder="400.00"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prod-desc">Storefront Description *</Label>
              <Textarea
                id="prod-desc"
                required
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g. Mega builder vault for elite construction teams"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prod-badge">Badge / Ribbon (Optional)</Label>
                <Input
                  id="prod-badge"
                  value={formData.badge}
                  onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                  placeholder="e.g. Best Value or Starter Pack"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prod-id">
                  Product ID {editingProduct ? "(Read-only)" : "(Optional)"}
                </Label>
                <Input
                  id="prod-id"
                  disabled={!!editingProduct}
                  value={formData.id || ""}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  placeholder="Auto-generated if left blank"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="prod-popular" className="font-bold text-sm">
                  Highlight as Popular
                </Label>
                <p className="text-xs text-muted-foreground">
                  Shows a featured gold highlight card in the shop
                </p>
              </div>
              <Switch
                id="prod-popular"
                checked={formData.popular}
                onCheckedChange={(checked) => setFormData({ ...formData, popular: checked })}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="prod-active" className="font-bold text-sm">
                  Active in Currency Shop
                </Label>
                <p className="text-xs text-muted-foreground">
                  When disabled, players cannot purchase this package
                </p>
              </div>
              <Switch
                id="prod-active"
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saveMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : editingProduct ? (
                  "Save Changes"
                ) : (
                  "Create Product"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteCandidate}
        onOpenChange={(open) => {
          if (!open) setDeleteCandidate(null);
        }}
        title={`Delete Product '${deleteCandidate?.name}'?`}
        description="Permanently delete this currency package? If transaction records exist, deletion is blocked. Disable the package to hide it instead."
        confirmLabel="Delete Product"
        destructive={true}
        onConfirm={() => {
          if (deleteCandidate) {
            deleteMutation.mutate(deleteCandidate.id);
          }
        }}
      />
    </AdminPage>
  );
}

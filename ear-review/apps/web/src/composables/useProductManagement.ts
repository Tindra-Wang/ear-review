import { ref, type Ref } from 'vue';
import { type Product } from '../../../../packages/contracts/index';
import { api, post } from '../api';
export function useProductManagement(products: Ref<Product[]>, notice: Ref<string>) {
    const addProductOpen = ref(false);
    const editingProduct = ref(false);
    const productForm = ref({ id: '', name: '', subtitle: '' });
    const productError = ref('');
    function editProduct(p?: Product) { editingProduct.value = !!p; productForm.value = p ? { id: p.id, name: p.name, subtitle: p.subtitle } : { id: '', name: '', subtitle: '' }; addProductOpen.value = true; productError.value = ''; }
    async function addProduct() { productError.value = ''; try {
        products.value = editingProduct.value ? await api<Product[]>(`/products/${productForm.value.id}`, { method: 'PATCH', body: JSON.stringify(productForm.value) }) : await post<Product[]>('/products', productForm.value);
        addProductOpen.value = false;
        productForm.value = { id: '', name: '', subtitle: '' };
        notice.value = '产品已保存，可以使用对应 ID 导入评论。';
    }
    catch (e) {
        productError.value = (e as Error).message;
    } }
    return { addProductOpen, editingProduct, productForm, productError, editProduct, addProduct };
}
